// js/api/authApi.js
import { auth } from "../config/firebase.js";
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Google 登入
export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("Google 登入失敗:", error);
        throw error;
    }
};

// 登出
export const logout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("登出失敗:", error);
        throw error;
    }
};

// 狀態監聽
export const onAuthStateChange = (callback) => {
    return onAuthStateChanged(auth, callback);
};

// 當前使用者
export const getCurrentUser = () => {
    return auth.currentUser;
};

// ==================== 全域相容別名匯出（徹底防呆） ====================
export const logoutUser = logout;
export const loginUser = loginWithGoogle;
export const subscribeAuthState = onAuthStateChange;
export const onAuthChanged = onAuthStateChange;
