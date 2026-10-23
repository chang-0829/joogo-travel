// js/config/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKryRO6V5NJ3G4cXRBaEZXITulb8eN0AY",
  authDomain: "joogo-travel.firebaseapp.com",
  projectId: "joogo-travel",
  storageBucket: "joogo-travel.firebasestorage.app",
  messagingSenderId: "312508995532",
  appId: "1:312508995532:web:913c60b8085f3797e42f69",
  measurementId: "G-0G0KNXX1Y4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
