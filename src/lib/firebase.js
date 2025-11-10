// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCZhkLdjplQ183d6fP1oxUSdymUE-ul5qc",
  authDomain: "catalogue-app-40e33.firebaseapp.com",
  projectId: "catalogue-app-40e33",
  storageBucket: "catalogue-app-40e33.appspot.com",
  messagingSenderId: "823560520865",
  appId: "1:823560520865:web:3655fbc65f5eb6c5239ce0",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore & Storage
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;