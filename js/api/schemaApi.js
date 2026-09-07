// js/api/schemaApi.js
import { db } from "../config/firebase.js";
import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const DEFAULT_CONTINENTS = ["亞洲", "歐洲", "美洲", "大洋洲", "非洲", "其他"];

export const DEFAULT_NOTICE_SCHEMA = [
    { id: "voltage", label: "電壓與插座規格", type: "text" },
    { id: "visa", label: "簽證 / 入境申報規範", type: "text" },
    { id: "traffic", label: "交通與支付指南", type: "textarea" },
    { id: "tax", label: "退稅與其他注意事項", type: "textarea" }
];

export const DEFAULT_EMERGENCY_SCHEMA = [
    { id: "police", label: "當地報警電話", type: "tel" },
    { id: "ambulance", label: "當地救護車專線", type: "tel" },
    { id: "embassy", label: "台灣駐外館處 / 急難救助電話", type: "text" },
    { id: "memo", label: "求助專線備註說明", type: "textarea" }
];

/**
 * 監聽指定類型的 Schema (continents, notice, emergency)
 */
export function subscribeSchema(type, callback, errorCallback) {
    let defaultData;
    if (type === 'continents') defaultData = { list: DEFAULT_CONTINENTS };
    else if (type === 'notice') defaultData = { fields: DEFAULT_NOTICE_SCHEMA };
    else defaultData = { fields: DEFAULT_EMERGENCY_SCHEMA };

    const docRef = doc(db, "templates", "schemas", "items", type);
    
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (type === 'continents') {
                const list = Array.isArray(data.list) ? data.list : DEFAULT_CONTINENTS;
                callback({ list });
            } else {
                const fields = Array.isArray(data.fields) ? data.fields : defaultData.fields;
                callback(fields);
            }
        } else {
            setDoc(docRef, defaultData);
            if (type === 'continents') callback(defaultData);
            else callback(defaultData.fields);
        }
    }, errorCallback);
}

/**
 * 更新指定類型的 Schema
 */
export async function saveSchema(type, data) {
    const docRef = doc(db, "templates", "schemas", "items", type);
    const payload = (type === 'continents' && Array.isArray(data)) ? { list: data } : data;
    await setDoc(docRef, payload, { merge: true });
}
