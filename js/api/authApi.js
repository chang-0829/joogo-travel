// js/api/authApi.js
import { auth, googleProvider } from "../config/firebase.js";
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. Google 快速登入
export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// 2. Email 帳密註冊
export async function registerWithEmail(email, password, displayName) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(userCredential.user, { displayName });
  }
  return userCredential.user;
}

// 3. Email 帳密登入
export async function loginWithEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

// 4. 登出
export async function logoutUser() {
  await signOut(auth);
}

// 5. 監聽登入狀態改變
export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}
