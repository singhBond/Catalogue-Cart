"use client";
import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Pencil, Eye, Trash, Plus, Upload, X } from "lucide-react";

/* ==================== Types ==================== */
interface Category {
  id: string;
  name?: string; // Now optional
  imageUrl?: string;
  createdAt?: Timestamp;
}
interface Product {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  unit?: string;
  dimension?: string;
  description?: string;
  imageUrl?: string;        // Legacy
  imageUrls?: string[];     // NEW: Multiple
  createdAt?: Timestamp;
}

/* ==================== Helpers ==================== */
const formatName = (raw: string) =>
  raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

// Removed: VALID_KEYWORDS & isValidCategory

const DEFAULT_CATEGORIES = [
  "Floor Tiles",
  "Wall Tiles",
  "Vitrified Tiles",
  "Ceramic Tiles",
  "Marbles",
  "Granite",
];

/* ==================== Image Compression ==================== */
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => (img.src = e.target?.result as string);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      let width = img.width, height = img.height;
      const MAX_DIM = 1200;
      if (width > height && width > MAX_DIM) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else if (height > MAX_DIM) {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.9;
      const TARGET_KB = 500 * 1024;

      const tryCompress = () => {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const byteLength = Math.round((dataUrl.length * 3) / 4);

        if (byteLength < TARGET_KB || quality <= 0.1) {
          resolve(dataUrl);
        } else {
          quality = Math.max(quality - 0.1, 0.1);
          setTimeout(tryCompress, 0);
        }
      };
      tryCompress();
    };

    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/* ==================== Multiple Image Handler ==================== */
const handleMultipleImages = async (
  e: React.ChangeEvent<HTMLInputElement>,
  setImages: React.Dispatch<React.SetStateAction<string[]>>,
  setPreviews: React.Dispatch<React.SetStateAction<string[]>>
) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const compressedPromises = files.map(async (file) => {
    try {
      const compressed = await compressImage(file);
      return compressed;
    } catch (err) {
      console.error("Compression failed:", err);
      return null;
    }
  });

  const results = await Promise.all(compressedPromises);
  const valid = results.filter((r): r is string => r !== null);

  setImages((prev) => [...prev, ...valid]);
  setPreviews((prev) => [...prev, ...valid]);
};

/* ==================== Main Component ==================== */
const AdminPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsByCat, setProductsByCat] = useState<Record<string, Product[]>>({});

  /* ---------- Clean-up junk + seed defaults ---------- */
  useEffect(() => {
    const cleanupAndSeed = async () => {
      const junkNames = ["Cars", "Tiles"];
      for (const bad of junkNames) {
        const q = query(collection(db, "categories"), where("name", "==", bad));
        const snap = await getDocs(q);
        for (const d of snap.docs) await deleteDoc(d.ref);
      }

      const snap = await getDocs(collection(db, "categories"));
      if (snap.empty) {
        for (const name of DEFAULT_CATEGORIES) {
          await addDoc(collection(db, "categories"), {
            name,
            imageUrl: "",
            createdAt: serverTimestamp(),
          });
        }
      }
    };
    cleanupAndSeed();
  }, []);

  /* ---------- Fetch Categories ---------- */
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "categories"),
      (snap) => {
        const fetched: Category[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const name = data.name ? formatName(data.name) : undefined; // Allow undefined
          fetched.push({
            id: d.id,
            name,
            imageUrl: data.imageUrl ?? undefined,
            createdAt: data.createdAt ?? undefined,
          });
        });
        const sorted = fetched.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
        setCategories(sorted);
      },
      (err) => {
        console.error(err);
        alert("Failed to load categories.");
      }
    );
    return () => unsub();
  }, []);

  /* ---------- Fetch Products ---------- */
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    categories.forEach((cat) => {
      const q = collection(db, "categories", cat.id, "products");
      const unsub = onSnapshot(
        q,
        (snap) => {
          const prods: Product[] = snap.docs.map((d) => {
            const data = d.data();
            const imageUrls = data.imageUrls || (data.imageUrl ? [data.imageUrl] : []);
            return {
              id: d.id,
              name: data.name ?? "Unnamed",
              price: data.price ?? 0,
              mrp: data.mrp ?? undefined,
              unit: data.unit ?? undefined,
              dimension: data.dimension ?? undefined,
              description: data.description ?? undefined,
              imageUrl: data.imageUrl ?? undefined,
              imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
              createdAt: data.createdAt ?? undefined,
            };
          });
          const sorted = prods.sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
          });
          setProductsByCat((p) => ({ ...p, [cat.id]: sorted }));
        },
        (e) => console.error(e)
      );
      unsubs.push(unsub);
    });
    return () => unsubs.forEach((u) => u());
  }, [categories]);

  /* ---------- UI ---------- */
  return (
    <section className="min-h-screen bg-linear-to-b from-amber-50 to-white p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold text-teal-700 mb-8 text-center md:text-left">
          Admin Panel - Fruits Walla
        </h1>

        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <h2 className="text-2xl font-semibold text-gray-800">Categories</h2>
          <AddCategoryDialog />
        </div>

        <Accordion type="single" collapsible className="space-y-4">
          {categories.map((cat) => (
            <AccordionItem
              key={cat.id}
              value={cat.id}
              className="border rounded-xl shadow-sm bg-white overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:bg-amber-50 transition-colors">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    {cat.imageUrl && (
                      <img
                        src={cat.imageUrl}
                        alt={cat.name || "Category"}
                        className="w-10 h-10 rounded-lg object-cover"
                      />
                    )}
                    <span className="text-lg font-medium text-gray-800">
                      {cat.name || "Uncategorized"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <EditCategoryDialog category={cat} />
                    <DeleteDialog
                      title="Delete Category"
                      description="All products will be deleted permanently."
                      onConfirm={() => deleteDoc(doc(db, "categories", cat.id))}
                    >
                      <Button variant="destructive" size="icon" className="h-8 w-8">
                        <Trash size={16} />
                      </Button>
                    </DeleteDialog>
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-4 bg-gray-50">
                <div className="flex justify-between items-center mb-4 mt-2">
                  <h3 className="text-lg font-semibold text-gray-700">Products</h3>
                  <AddProductDialog categoryId={cat.id} />
                </div>

                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        {["Name", "Price", "Unit", "Dimension", "Image", "Actions"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left font-medium text-gray-700"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {(productsByCat[cat.id] || []).map((p) => (
                        <ProductRow key={p.id} categoryId={cat.id} product={p} />
                      ))}

                      {!(productsByCat[cat.id]?.length) && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-gray-500">
                            No products yet. Add one!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {categories.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No categories found.</p>
            <p className="text-sm mt-2">Adding default categories…</p>
          </div>
        )}
      </div>
    </section>
  );
};

/* ==================== Dialogs ==================== */

/* ---- Add Category ---- */
const AddCategoryDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [sizeInfo, setSizeInfo] = useState("");

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImage(file).then((compressed) => {
      setImage(compressed);
      setPreview(compressed);
      const kb = (compressed.length * 0.75 / 1024).toFixed(1);
      setSizeInfo(`~${kb} KB`);
    }).catch(() => alert("Failed to compress image."));
  };

  const handleSubmit = async () => {
    try {
      await addDoc(collection(db, "categories"), {
        name: name.trim() ? formatName(name) : undefined, // Allow undefined
        imageUrl: image || "",
        createdAt: serverTimestamp(),
      });
      setOpen(false);
      setName("");
      setImage(null);
      setPreview("");
      setSizeInfo("");
    } catch (e) {
      console.error(e);
      alert("Failed to add category.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-teal-600 hover:bg-teal-700">
          <Plus size={16} className="mr-2" /> Add Category
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Category</DialogTitle>
          <DialogDescription>
            Create a new category. Name is optional.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="cat-name">Name (Optional)</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Floor Tiles (leave blank if not needed)"
            />
          </div>
          <div>
            <Label htmlFor="cat-image">Image (auto-compressed less than 500 KB)</Label>
            <Input id="cat-image" type="file" accept="image/*" onChange={handleImage} />
            {preview && (
              <div className="mt-3">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-lg"
                />
                <p className="text-xs text-gray-500 text-center mt-1">{sizeInfo}</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit}>Add Category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---- Edit Category ---- */
interface EditCategoryDialogProps {
  category: Category;
}
const EditCategoryDialog: React.FC<EditCategoryDialogProps> = ({ category }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name || "");
  const [image, setImage] = useState<string | null>(category.imageUrl || null);
  const [preview, setPreview] = useState(category.imageUrl || "");
  const [sizeInfo, setSizeInfo] = useState("");

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImage(file).then((compressed) => {
      setImage(compressed);
      setPreview(compressed);
      const kb = (compressed.length * 0.75 / 1024).toFixed(1);
      setSizeInfo(`~${kb} KB`);
    }).catch(() => alert("Failed to compress image."));
  };

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, "categories", category.id), {
        name: name.trim() ? formatName(name) : undefined,
        imageUrl: image || "",
      });
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert("Failed to update.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <Pencil size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>
            Update category name and image. Name is optional.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="edit-cat-name">Name (Optional)</Label>
            <Input
              id="edit-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave blank to remove name"
            />
          </div>
          <div>
            <Label htmlFor="edit-cat-image">Image (auto-compressed less than 500 KB)</Label>
            <Input id="edit-cat-image" type="file" accept="image/*" onChange={handleImage} />
            {preview && (
              <div className="mt-3">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-lg"
                />
                <p className="text-xs text-gray-500 text-center mt-1">{sizeInfo}</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ==================== Rest of the file (unchanged) ==================== */
// [AddProductDialog, ProductRow, EditProductDialog, ViewProductDialog, DeleteDialog]
// → All unchanged below. Paste from your original code.

{/* --- Paste from your original file below this line --- */}
{/* (AddProductDialog, ProductRow, EditProductDialog, ViewProductDialog, DeleteDialog) */}
{/* Everything from here to export default AdminPage; is unchanged */}

/* ---- Add Product (Multiple Images) ---- */
interface AddProductDialogProps {
  categoryId: string;
}
const AddProductDialog: React.FC<AddProductDialogProps> = ({ categoryId }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | undefined>();
  const [mrp, setMrp] = useState<number | undefined>();
  const [unit, setUnit] = useState("");
  const [dimension, setDimension] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMultipleImages(e, setImages, setPreviews);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !price || price <= 0) {
      alert("Name and price required.");
      return;
    }
    try {
      await addDoc(collection(db, "categories", categoryId, "products"), {
        name: name.trim(),
        price,
        mrp: mrp || null,
        unit: unit || "unit",
        dimension: dimension || null,
        description: description || null,
        imageUrls: images.length > 0 ? images : null,
        imageUrl: images[0] || "", // legacy
        createdAt: serverTimestamp(),
      });
      setOpen(false);
      setName(""); setPrice(0); setMrp(undefined); setUnit(""); setDimension(""); setDescription("");
      setImages([]); setPreviews([]);
    } catch (e) {
      console.error(e);
      alert("Failed to add product.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
          <Plus size={14} className="mr-1" /> Add Product
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>
            Add a new product. Fill in name, price, and optional details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div>
            <Label htmlFor="prod-name">Name</Label>
            <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div>
              <Label htmlFor="prod-mrp">MRP </Label>
              <Input
                id="prod-mrp"
                type="number"
                value={mrp ?? ""}
                onChange={(e) => setMrp(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
            <div>
              <Label htmlFor="prod-price">Offer Price</Label>
              <Input
                id="prod-price"
                type="number"
                value={price ?? ""}
                onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
           
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="prod-unit">Unit</Label>
              <Input
                id="prod-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g., sq.ft"
              />
            </div>
            <div>
              <Label htmlFor="prod-dim">Dimension</Label>
              <Input
                id="prod-dim"
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                placeholder="e.g., 2x2 ft"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="prod-desc">Description (Optional)</Label>
            <Textarea
              id="prod-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="">
  <Label>Images (auto-compressed less than 500 KB each)</Label>

  <div className="grid grid-cols-2 gap-3 mt-3">
    {previews.map((src, i) => (
      <div key={i} className="relative group">
        <img
          src={src}
          alt={`Preview ${i + 1}`}
          className="w-full h-32 object-cover rounded-lg"
        />
        <button
          onClick={() => removeImage(i)}
          className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
        <p className="text-xs text-center mt-1">
          {(src.length * 0.75 / 1024).toFixed(0)} KB
        </p>
      </div>
    ))}

    <div
      className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:border-teal-500"
      onClick={() => document.getElementById("add-multi-image")?.click()}
    >
      <Upload className="h-8 w-8 text-gray-400" />
      <p className="text-sm text-gray-600 mt-2">
        {previews.length > 0 ? "Upload more images" : "Click or drag to upload"}
      </p>
    </div>
  </div>

  <input
    id="add-multi-image"
    type="file"
    accept="image/*"
    multiple
    hidden
    onChange={handleImageChange}
  />
</div>


          
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit}>Add Product</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---- Product Row (Show First Image + Count) ---- */
interface ProductRowProps {
  categoryId: string;
  product: Product;
}
const ProductRow: React.FC<ProductRowProps> = ({ categoryId, product }) => {
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const imageCount = (product.imageUrls?.length || 0) + (product.imageUrl ? 1 : 0);
  const displayImage = product.imageUrls?.[0] || product.imageUrl;

  return (
    <tr className="border-b hover:bg-gray-50 transition-colors">
      <td className="px-3 py-3 text-sm font-medium">{product.name}</td>
      <td className="px-3 py-3 text-sm">₹{product.price}</td>
      <td className="px-3 py-3 text-sm">{product.unit || "-"}</td>
      <td className="px-3 py-3 text-sm">{product.dimension || "-"}</td>
      <td className="px-3 py-3">
        {displayImage ? (
          <div className="relative">
            <img
              src={displayImage}
              alt={product.name}
              className="w-12 h-12 object-cover rounded"
            />
            {imageCount > 1 && (
              <span className="absolute -top-1 -right-1 bg-teal-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {imageCount}
              </span>
            )}
          </div>
        ) : (
          <div className="w-12 h-12 bg-gray-200 border rounded flex items-center justify-center">
            <Upload size={16} className="text-gray-400" />
          </div>
        )}
      </td>

      <td className="px-3 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Pencil size={14} />
              </Button>
            </DialogTrigger>
            <EditProductDialog
              categoryId={categoryId}
              product={product}
              onClose={() => setEditOpen(false)}
            />
          </Dialog>

          <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <Eye size={14} />
              </Button>
            </DialogTrigger>
            <ViewProductDialog product={product} onClose={() => setViewOpen(false)} />
          </Dialog>

          <DeleteDialog
            title="Delete Product"
            description="This action cannot be undone."
            onConfirm={() =>
              deleteDoc(doc(db, "categories", categoryId, "products", product.id))
            }
          >
            <Button size="icon" variant="destructive" className="h-8 w-8">
              <Trash size={14} />
            </Button>
          </DeleteDialog>
        </div>
      </td>
    </tr>
  );
};

/* ---- Edit Product (Multiple Images) ---- */
interface EditProductDialogProps {
  categoryId: string;
  product: Product;
  onClose: () => void;
}
const EditProductDialog: React.FC<EditProductDialogProps> = ({
  categoryId,
  product,
  onClose,
}) => {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(product.price);
  const [mrp, setMrp] = useState(product.mrp);
  const [unit, setUnit] = useState(product.unit || "");
  const [dimension, setDimension] = useState(product.dimension || "");
  const [description, setDescription] = useState(product.description || "");
  const [images, setImages] = useState<string[]>(product.imageUrls || (product.imageUrl ? [product.imageUrl] : []));
  const [previews, setPreviews] = useState<string[]>(product.imageUrls || (product.imageUrl ? [product.imageUrl] : []));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleMultipleImages(e, setImages, setPreviews);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim() || price <= 0) {
      alert("Name and price required.");
      return;
    }
    try {
      await updateDoc(doc(db, "categories", categoryId, "products", product.id), {
        name: name.trim(),
        price,
        mrp: mrp || null,
        unit: unit || "unit",
        dimension: dimension || null,
        description: description || null,
        imageUrls: images.length > 0 ? images : null,
        imageUrl: images[0] || "",
      });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to update product.");
    }
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Product</DialogTitle>
        <DialogDescription>
          Update product details. Name and price are required.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Price</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </div>
          <div>
            <Label>MRP</Label>
            <Input
              type="number"
              value={mrp ?? ""}
              onChange={(e) => setMrp(e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div>
            <Label>Dimension</Label>
            <Input value={dimension} onChange={(e) => setDimension(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div>
          <Label>Images</Label>
          <div
            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-teal-500"
            onClick={() => document.getElementById("edit-multi-image")?.click()}
          >
            <Upload className="mx-auto h-8 w-8 text-gray-400" />
            <p className="text-sm text-gray-600 mt-2">Add more images</p>
          </div>
          <input id="edit-multi-image" type="file" accept="image/*" multiple hidden onChange={handleImageChange} />
        </div>

        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative group">
                <img src={src} alt={`Preview ${i + 1}`} className="w-full h-24 object-cover rounded-lg" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={handleSave}>Save Changes</Button>
      </DialogFooter>
    </DialogContent>
  );
};

/* ---- View Product (First Image Only) ---- */
interface ViewProductDialogProps {
  product: Product;
  onClose: () => void;
}
const ViewProductDialog: React.FC<ViewProductDialogProps> = ({ product, onClose }) => {
  const displayImage = product.imageUrls?.[0] || product.imageUrl;

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{product.name}</DialogTitle>
        <DialogDescription>
          View product details including price,quantity and description.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-4">
        {displayImage && (
          <img
            src={displayImage}
            alt={product.name}
            className="w-full h-56 object-cover rounded-lg"
          />
        )}
        <div className="space-y-2 text-sm">
          <p><strong>Price:</strong> ₹{product.price}</p>
          {product.mrp && <p><strong>MRP:</strong> <del>₹{product.mrp}</del></p>}
          {product.unit && <p><strong>Unit:</strong> {product.unit}</p>}
          {product.dimension && <p><strong>Size:</strong> {product.dimension}</p>}
          {product.description && <p><strong>Description:</strong> {product.description}</p>}
          {product.createdAt && (
            <p><strong>Added:</strong> {new Date(product.createdAt.toMillis()).toLocaleDateString()}</p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  );
};

/* ---- Delete Dialog ---- */
interface DeleteDialogProps {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  children: React.ReactNode;
}
const DeleteDialog: React.FC<DeleteDialogProps> = ({
  title,
  description,
  onConfirm,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const handle = async () => {
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      alert("Failed to delete.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handle}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminPage;