"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShoppingCart,
  Plus,
  Minus,
  CheckCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// === Interfaces ===
interface Product {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  unit?: string;
  dimension?: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imagePath?: string;
  createdAt?: Timestamp | any;
}

interface CartItem extends Product {
  quantity: number;
}

interface Category {
  id: string;
  name: string;
  imageUrl?: string;
  imagePath?: string;
  createdAt?: Timestamp | any;
}

// === Read More Component ===
const DescriptionWithReadMore: React.FC<{ text: string }> = ({ text }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const maxLength = 120;

  if (!text || text.length <= maxLength) {
    return <p className="text-sm text-gray-700">{text}</p>;
  }

  return (
    <div>
      <p className={`text-sm text-gray-700 ${isExpanded ? "" : "line-clamp-3"}`}>
        {isExpanded ? text : `${text.slice(0, maxLength)}...`}
      </p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-teal-600 font-medium text-sm mt-1 hover:underline"
      >
        {isExpanded ? "Read less" : "Read more"}
      </button>
    </div>
  );
};

// === Main Component ===
const CataloguePage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsByCat, setProductsByCat] = useState<Record<string, Product[]>>({});
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [successOpen, setSuccessOpen] = useState<boolean>(false);
  const [orderId, setOrderId] = useState<string>("");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [selectedProduct]);

  // === Load Categories ===
  useEffect(() => {
    const q = query(collection(db, "categories"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const fetchedCategories: Category[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || "Unnamed",
            imageUrl: data.imageUrl || "",
            imagePath: data.imagePath,
            createdAt: data.createdAt,
          };
        });

        const sorted = fetchedCategories.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });

        setCategories(sorted);

        if (sorted.length > 0) {
          const currentExists = sorted.some((cat) => cat.id === activeCategory);
          if (!currentExists) {
            setActiveCategory(sorted[0].id);
          }
        } else {
          setActiveCategory("");
        }
      },
      (error) => {
        console.error("Error fetching categories:", error);
      }
    );

    return () => unsub();
  }, [activeCategory]);

  // === Load Products ===
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    categories.forEach((cat) => {
      const q = query(collection(db, "categories", cat.id, "products"));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const fetchedProducts: Product[] = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            const imageUrls = data.imageUrls || (data.imageUrl ? [data.imageUrl] : []);
            return {
              id: docSnap.id,
              name: data.name || "Unnamed Product",
              price: data.price || 0,
              mrp: data.mrp,
              unit: data.unit || "unit",
              dimension: data.dimension,
              description: data.description,
              imageUrl: data.imageUrl || "",
              imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
              imagePath: data.imagePath,
              createdAt: data.createdAt,
            };
          });

          const sorted = fetchedProducts.sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
          });

          setProductsByCat((prev) => ({ ...prev, [cat.id]: sorted }));
        },
        (error) => {
          console.error(`Error fetching products for ${cat.name}:`, error);
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [categories]);

  // === Cart Persistence ===
  useEffect(() => {
    const saved = localStorage.getItem("catalogue_cart");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCart(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error("Corrupted cart data", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("catalogue_cart", JSON.stringify(cart));
  }, [cart]);

  // === Cart Actions ===
  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.id === product.id);
      if (exists) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setSelectedProduct(null);
  };

  const increaseQty = (id: string) =>
    setCart((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i))
    );

  const decreaseQty = (id: string) =>
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i
        )
        .filter((i) => i.quantity > 0)
    );

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((i) => i.id !== id));

  const handleContactClick = (product: Product) => {
    const unit = product.unit || "unit";
    const message = `Hello! I'm interested in:\n\n*${product.name}*\nPrice: ₹${product.price}/${unit}\n${
      product.mrp ? `MRP: ₹${product.mrp}/${unit}\n` : ""
    }${product.dimension ? `Size: ${product.dimension}\n` : ""}${
      product.description ? `Details: ${product.description}\n` : ""
    }\nPlease share more info.`;
    window.open(
      `https://wa.me/917970521414?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  };

  const handleProceedToBuy = () => {
    if (cart.length === 0) return;

    const totalAmount = cart.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
    const orderDetails = cart
      .map((item) => {
        const unit = item.unit || "unit";
        return `*${item.name}* x${item.quantity} — ₹${(
          item.price * item.quantity
        ).toFixed(2)} (₹${item.price}/${unit})`;
      })
      .join("\n");

    const newOrderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    setOrderId(newOrderId);

    const message = `*New Order*\n\n*Order ID:* ${newOrderId}\n\n${orderDetails}\n\n*Total: ₹${totalAmount.toFixed(
      2
    )}*\n\nPlease confirm my order.`;

    window.open(
      `https://wa.me/917970521414?text=${encodeURIComponent(message)}`,
      "_blank"
    );

    setCart([]);
    localStorage.removeItem("catalogue_cart");
    setCartOpen(false);
    setSuccessOpen(true);
  };

  const currentCategoryName =
    categories.find((cat) => cat.id === activeCategory)?.name || "Loading...";
  const currentProducts = productsByCat[activeCategory] || [];
  const totalAmount = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  const getImageArray = (product: Product): string[] => {
    if (product.imageUrls && product.imageUrls.length > 0) {
      return product.imageUrls.filter(url => url && url.trim() !== "");
    }
    return product.imageUrl && product.imageUrl.trim() !== "" ? [product.imageUrl] : ["/placeholder.svg"];
  };

  const navigateImage = (direction: "prev" | "next") => {
    if (!selectedProduct) return;
    const images = getImageArray(selectedProduct);
    setCurrentImageIndex((prev) => {
      if (direction === "prev") {
        return prev === 0 ? images.length - 1 : prev - 1;
      }
      return prev === images.length - 1 ? 0 : prev + 1;
    });
  };

  return (
    <section className="min-h-screen bg-linear-to-b from-amber-50 to-white relative">
      {/* Header */}
      <div className="flex flex-col items-center text-center py-10 bg-linear-to-r from-orange-100 via-amber-100 to-yellow-50">
        <h1 className="text-4xl md:text-6xl font-extrabold text-teal-700">
          Fruits Walla
        </h1>
        <h2 className="text-2xl md:text-4xl font-bold text-orange-700 mt-2">
          Eat Healthy , Be Healthy
        </h2>
        <p className="text-gray-600 max-w-2xl mt-3 text-sm md:text-lg">
          Get fresh , high-quality fruits and vegetables for your space.
        </p>
      </div>

      {/* Layout - Original Sidebar Preserved */}
      <div className="flex flex-row w-full max-w-7xl mx-auto px-4 py-10 gap-6">
        {/* Sidebar */}
        <aside className="w-28 sm:w-40 md:w-60 sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto bg-amber-50 border-r rounded-xl shadow-sm p-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex flex-col items-center cursor-pointer rounded-xl p-3 mb-3 transition-all border ${
                activeCategory === cat.id
                  ? "bg-amber-100 border-amber-400 shadow-md"
                  : "hover:bg-gray-50 border-transparent"
              }`}
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 shadow-sm">
                <img
                  src={cat.imageUrl || "/placeholder.svg"}
                  alt={cat.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg";
                  }}
                />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-center mt-2 uppercase">
                {cat.name}
              </span>
            </div>
          ))}
        </aside>

        {/* Products Grid - Cards with ORIGINAL SIZE */}
        <main className="flex-1">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
            {currentCategoryName}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {currentProducts.map((product) => {
              const unit = product.unit || "unit";
              const firstImage = product.imageUrls?.[0] || product.imageUrl || "/placeholder.svg";
              return (
                <Card
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="overflow-hidden rounded-2xl bg-amber-50 shadow-md hover:shadow-xl transition-all cursor-pointer flex flex-col border"
                >
                  {/* Fixed Height Image - Same as Original */}
                  <div className="relative w-full h-56 bg-gray-100">
                    <img
                      src={firstImage}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg";
                      }}
                    />
                  </div>

                  {/* Responsive Content Inside Fixed Card */}
                  <div className=" py-2 px-4 flex flex-col grow">
                    <h3 className="font-semibold text-lg text-gray-800 line-clamp-2 ">
                      {product.name}
                    </h3>
                    {product.dimension && (
                      <p className="text-sm mt-1 text-gray-500  line-clamp-1">
                        {product.dimension}
                      </p>
                    )}
                    <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                      <span className="text-xl font-bold text-amber-600">
                        ₹{product.price}
                      </span>
                      <span className="text-sm text-gray-500">/{unit}</span>
                      {product.mrp && (
                        <span className="text-sm text-gray-400 line-through">
                          ₹{product.mrp}/{unit}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </main>
      </div>

      {/* === RESPONSIVE PRODUCT DIALOG (Unchanged from last version) === */}
     <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
  {selectedProduct && (
    <DialogContent className="max-w-full w-full h-full md:max-w-2xl md:h-auto md:max-h-[90vh] rounded-none md:rounded-2xl p-0 overflow-hidden">
      <DialogHeader className="p-4 md:p-4 pb-0.5">
        <DialogTitle className="text-lg md:text-xl pr-10">{selectedProduct.name}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col md:flex-row gap-2 md:gap-4 p-2 md:p-4 pt-0 overflow-y-auto max-h-[80vh] md:max-h-none">
        {/* Image Carousel */}
        <div className="relative w-full md:w-1/2 h-64 md:h-80 bg-gray-100 rounded-lg overflow-hidden shrink-0">
          {(() => {
            const images = getImageArray(selectedProduct);
            const currentImg = images[currentImageIndex] || "/placeholder.svg";
            return (
              <>
                <img
                  src={currentImg}
                  alt={`${selectedProduct.name} - ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder.svg";
                  }}
                />
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => navigateImage("prev")}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => navigateImage("next")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                      {currentImageIndex + 1} / {images.length}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>

        {/* Product Details */}
        <div className="flex-1 flex flex-col justify-between mt-1 md:mt-0">
          <div className="space-y-2">
            {selectedProduct.dimension && (
              <p className="text-sm text-gray-600">
                <strong>Size:</strong> {selectedProduct.dimension}
              </p>
            )}
            {selectedProduct.description && (
              <div>
                <DescriptionWithReadMore text={selectedProduct.description} />
              </div>
            )}
          </div>

          <div className="mt-3">
            <p className="text-2xl font-bold text-amber-600">
              ₹{selectedProduct.price}
              <span className="text-sm font-normal text-gray-500 ml-1">
                /{selectedProduct.unit || "unit"}
              </span>
            </p>
            {selectedProduct.mrp && (
              <p className="text-sm text-gray-400 line-through">
                ₹{selectedProduct.mrp}/{selectedProduct.unit || "unit"}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm md:text-base"
              onClick={() => handleAddToCart(selectedProduct)}
            >
              Add to Cart
            </Button>
            <Button
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-sm md:text-base"
              onClick={() => handleContactClick(selectedProduct)}
            >
              Contact to Buy
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  )}
</Dialog>

      {/* Floating Cart */}
      <div
        onClick={() => setCartOpen(true)}
        className="fixed bottom-6 right-6 bg-teal-600 hover:bg-teal-700 text-white p-4 rounded-full shadow-lg cursor-pointer transition-all z-40"
      >
        <ShoppingCart size={26} />
        {cart.length > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
            {cart.length}
          </span>
        )}
      </div>

      {/* Cart Dialog */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-lg rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle>Your Cart ({cart.length} items)</DialogTitle>
          </DialogHeader>
          {cart.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Your cart is empty.</p>
          ) : (
            <div className="flex flex-col gap-4 mt-3 max-h-96 overflow-y-auto">
              {cart.map((item) => {
                const unit = item.unit || "unit";
                const firstImage = item.imageUrls?.[0] || item.imageUrl || "/placeholder.svg";
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-14 h-14 rounded-md overflow-hidden bg-gray-100">
                        <img
                          src={firstImage}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder.svg";
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm line-clamp-1">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          ₹{item.price}/{unit} × {item.quantity}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => decreaseQty(item.id)}
                      >
                        <Minus size={12} />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => increaseQty(item.id)}
                      >
                        <Plus size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-50"
                        onClick={() => removeFromCart(item.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-between font-bold text-lg text-gray-800 mt-4 pt-3 border-t">
                <span>Total:</span>
                <span>₹{totalAmount.toFixed(2)}</span>
              </div>

              <Button
                className="mt-3 bg-teal-600 hover:bg-teal-700 text-white"
                onClick={handleProceedToBuy}
              >
                Proceed to Buy via WhatsApp
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-sm text-center rounded-2xl p-8">
          <CheckCircle className="text-green-500 w-16 h-16 mx-auto mb-3" />
          <DialogTitle className="text-xl font-bold text-gray-800 mb-2">
            Order Placed!
          </DialogTitle>
          <p className="text-gray-600">
            Your order <span className="font-semibold text-teal-600">#{orderId}</span> has been sent via WhatsApp.
          </p>
          <Button
            className="mt-5 bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setSuccessOpen(false)}
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default CataloguePage;