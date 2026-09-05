// js/api/templateApi.js
import { db } from "../config/firebase.js";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc,
  deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. 取得所有航空公司行李模板
export async function getAirlineTemplates() {
  const querySnapshot = await getDocs(collection(db, "templates", "airlines", "items"));
  const airlines = [];
  querySnapshot.forEach((docSnap) => {
    airlines.push({ id: docSnap.id, ...docSnap.data() });
  });
  return airlines;
}

// 2. 儲存/更新特定航空公司規範 (開發者專用)
export async function saveAirlineTemplate(code, data) {
  const docRef = doc(db, "templates", "airlines", "items", code.trim().toUpperCase());
  await setDoc(docRef, data, { merge: true });
}

// 3. 刪除特定航空公司模板
export async function deleteAirlineTemplate(code) {
  const docRef = doc(db, "templates", "airlines", "items", code);
  await deleteDoc(docRef);
}

// 4. 取得所有國家的公版急難救助與須知
export async function getCountryTemplates() {
  const querySnapshot = await getDocs(collection(db, "templates", "countries", "items"));
  const countries = [];
  querySnapshot.forEach((docSnap) => {
    countries.push({ id: docSnap.id, ...docSnap.data() });
  });
  return countries;
}

// 5. 儲存/更新國家急難求助資訊 (開發者專用)
export async function saveCountryTemplate(countryName, data) {
  const docRef = doc(db, "templates", "countries", "items", countryName.trim());
  await setDoc(docRef, data, { merge: true });
}

// 6. 刪除特定國家公版
export async function deleteCountryTemplate(countryName) {
  const docRef = doc(db, "templates", "countries", "items", countryName);
  await deleteDoc(docRef);
}
