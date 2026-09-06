// js/api/authApi.js
import { auth } from "../config/firebase.js";
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("Google 登入失敗:", error);
        throw error;
    }
};

export const logout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("登出失敗:", error);
        throw error;
    }
};

export const onAuthStateChange = (callback) => {
    return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = () => {
    return auth.currentUser;
};

// ==================== 全命名雙向相容別名 ====================
export const logoutUser = logout;
export const loginUser = loginWithGoogle;
export const subscribeAuthState = onAuthStateChange;
export const onAuthChanged = onAuthStateChange;
