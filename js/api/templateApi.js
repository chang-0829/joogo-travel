// js/api/templateApi.js
import { db } from "../config/firebase.js";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 取得所有支援的航空公司行李模板
export async function getAirlineTemplates() {
  const querySnapshot = await getDocs(collection(db, "templates", "airlines", "items"));
  const airlines = [];
  querySnapshot.forEach((docSnap) => {
    airlines.push({ id: docSnap.id, ...docSnap.data() });
  });
  return airlines;
}

// 寫入/更新特定航空公司規範 (開發者專用)
export async function saveAirlineTemplate(code, data) {
  const docRef = doc(db, "templates", "airlines", "items", code);
  await setDoc(docRef, data, { merge: true });
}

// 取得特定國家的急難求助與旅遊須知
export async function getCountryTemplate(countryCode) {
  const docRef = doc(db, "templates", "countries", "items", countryCode);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
}

// 寫入/更新國家急難求助資訊 (開發者專用)
export async function saveCountryTemplate(countryCode, data) {
  const docRef = doc(db, "templates", "countries", "items", countryCode);
  await setDoc(docRef, data, { merge: true });
}
