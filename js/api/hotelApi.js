// js/api/hotelApi.js
import { db } from "../config/firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 預設示範住宿資料
export const defaultHotelsData = [
  {
    id: "h_default_1",
    nameZh: "格拉斯麗新宿飯店",
    nameForeign: "Hotel Gracery Shinjuku",
    addressZh: "東京都新宿區歌舞伎町 1-19-1",
    addressForeign: "1-19-1 Kabukicho, Shinjuku-ku, Tokyo",
    phone: "+81 3-5155-3311",
    refNo: "HG-8821903",
    gateType: "code",
    gateCode: "#1234",
    checkInDate: "2026-04-01",
    checkInTime: "15:00",
    checkOutDate: "2026-04-05",
    checkOutTime: "11:00",
    rooms: [
      { id: "r_1", roomNo: "301", roomType: "標準雙人房", entryType: "code", roomCode: "5678*", assignedPartnerIds: ["user_alex_default"] },
      { id: "r_2", roomNo: "302", roomType: "雙床雙人房", entryType: "card", roomCode: "", assignedPartnerIds: [] }
    ]
  }
];

// 取得行程的所有住宿資訊
export async function getTripHotels(tripId) {
  const docRef = doc(db, "trips", tripId, "details", "hotels");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists() && docSnap.data().list) {
    return docSnap.data().list;
  }
  return defaultHotelsData;
}

// 儲存/更新行程的所有住宿資訊
export async function saveTripHotels(tripId, hotelList) {
  const docRef = doc(db, "trips", tripId, "details", "hotels");
  await setDoc(docRef, { list: hotelList }, { merge: true });
}
