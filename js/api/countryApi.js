// js/api/countryApi.js
import { db } from "../config/firebase.js";
import { 
    collection, doc, onSnapshot, getDoc, setDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const COUNTRIES_COL = collection(db, "templates", "countries", "items");

/**
 * 監聽所有國家/地區列表
 */
export function subscribeCountries(callback, errorCallback) {
    return onSnapshot(COUNTRIES_COL, (snapshot) => {
        const countries = [];
        snapshot.forEach(docSnap => {
            countries.push({ id: docSnap.id, ...docSnap.data() });
        });
        callback(countries);
    }, errorCallback);
}

/**
 * 取得單一國家詳細資料
 */
export async function getCountryDetail(countryId) {
    const docRef = doc(db, "templates", "countries", "items", countryId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data();
}

/**
 * 儲存或更新單一國家資料
 */
export async function saveCountryDetail(countryId, data) {
    const docRef = doc(db, "templates", "countries", "items", countryId);
    await setDoc(docRef, data, { merge: true });
}

/**
 * 刪除國家/地區
 */
export async function removeCountry(countryId) {
    const docRef = doc(db, "templates", "countries", "items", countryId);
    await deleteDoc(docRef);
}
