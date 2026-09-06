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

// 監聽登入狀態改變 (同時提供 subscribeAuthState 與 onAuthStateChange 以相容不同頁面)
export const subscribeAuthState = (callback) => {
    return onAuthStateChanged(auth, callback);
};

export const onAuthStateChange = (callback) => {
    return onAuthStateChanged(auth, callback);
};

// 取得當前登入者
export const getCurrentUser = () => {
    return auth.currentUser;
};
