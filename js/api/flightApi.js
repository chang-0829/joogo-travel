// js/api/flightApi.js
import { db } from "../config/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 預設空白航班結構 (當行程尚未設定航班時的 fallback)
export const defaultFlightData = {
  outbound: {
    date: "",
    pnr: "",
    airline: "中華航空",
    flightNo: "CI-100",
    terminal: "第 2 航廈",
    counter: "12 號櫃檯",
    checkinTime: "06:50",
    depTime: "08:50",
    arrTime: "13:15",
    depAirport: "桃園 (TPE)",
    arrAirport: "成田 (NRT)",
    duration: "3h 25m",
    boardingTime: "08:10",
    gate: "A7",
    baggage: {
      mode: "piece",
      checkedQuota: "2 件 (每件 23 kg)",
      checkedDim: "三邊總和 ≤ 158 cm",
      carryQuota: "1 件 (7 kg)",
      carryDim: "55 x 40 x 23 cm",
      personalQuota: "1 件 (隨身包/筆電包)",
      personalDim: "40 x 30 x 10 cm"
    }
  },
  inbound: {
    date: "",
    pnr: "",
    airline: "中華航空",
    flightNo: "CI-101",
    terminal: "第 2 航廈",
    counter: "K 櫃檯",
    checkinTime: "12:30",
    depTime: "14:30",
    arrTime: "17:15",
    depAirport: "成田 (NRT)",
    arrAirport: "桃園 (TPE)",
    duration: "3h 45m",
    boardingTime: "13:50",
    gate: "71",
    baggage: {
      mode: "piece",
      checkedQuota: "2 件 (每件 23 kg)",
      checkedDim: "三邊總和 ≤ 158 cm",
      carryQuota: "1 件 (7 kg)",
      carryDim: "55 x 40 x 23 cm",
      personalQuota: "1 件 (隨身包/筆電包)",
      personalDim: "40 x 30 x 10 cm"
    }
  }
};

// 1. 取得該房間的航班資料
export async function getTripFlight(tripId) {
  const docRef = doc(db, "trips", tripId, "details", "flight");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return defaultFlightData;
}

// 2. 儲存/更新該房間的航班資料
export async function saveTripFlight(tripId, flightData) {
  const docRef = doc(db, "trips", tripId, "details", "flight");
  await setDoc(docRef, flightData, { merge: true });
}
