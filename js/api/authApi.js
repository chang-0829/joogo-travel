// js/api/authApi.js
import { auth } from "../config/firebase.js";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 統一在此處管理 Google Provider 配置
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" }); // 每次彈窗強制讓使用者可挑選 Google 帳號

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("【Auth】Google 登入失敗:", error.code, error.message);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("【Auth】登出失敗:", error);
    throw error;
  }
};

export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = () => {
  return auth.currentUser;
};

// 舊命名過渡相容別名
export const loginUser = loginWithGoogle;
export const logoutUser = logout;
export const onAuthChanged = onAuthStateChange;
export const subscribeAuthState = onAuthStateChange;
