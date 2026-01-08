import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: "poket-money-ads-6635f.firebaseapp.com",
    projectId: "poket-money-ads-6635f",
    storageBucket: "poket-money-ads-6635f.firebasestorage.app",
    messagingSenderId: "909562364724",
    appId: "1:909562364724:web:14e39972b8b67eddfd5b61",
    measurementId: "G-TYBVZSZF7L"
};

console.log("Firebase Config Project ID:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const functions = getFunctions(app, 'us-central1');

// [DEBUG] Log Config to verify project ID (Safe to log project ID, key is public but avoid logging full key if paranoid, though often standard)
console.log("🔥 Firebase Config Loaded:", {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    storageBucket: firebaseConfig.storageBucket
});
