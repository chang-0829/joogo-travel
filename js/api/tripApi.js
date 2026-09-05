// js/api/tripApi.js
import { db } from "../config/firebase.js";
import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 隨機產生 6 位大寫英數邀請碼
export function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的 I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 1. 建立新行程房間
export async function createTrip(tripData, creatorUser) {
  const inviteCode = generateInviteCode();
  
  // 建立成員結構
  const members = {};
  members[creatorUser.uid] = {
    id: creatorUser.uid,
    name: creatorUser.name,
    avatar: creatorUser.avatar,
    role: "admin",
    isCreator: true,
    seatOut: "",
    seatIn: ""
  };

  const newTrip = {
    title: tripData.title,
    country: tripData.country,
    startDate: tripData.startDate,
    endDate: tripData.endDate,
    coverImage: tripData.coverImage || (tripData.country === '台灣' 
      ? 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=600'
      : 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=600'),
    inviteCode: inviteCode,
    isInviteEnabled: true,
    approvalMode: "auto",
    memberUids: [creatorUser.uid],
    members: members,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, "trips"), newTrip);
  return { id: docRef.id, ...newTrip };
}

// 2. 取得目前使用者所加入的所有行程清單
export async function getUserTrips(userUid) {
  const tripsRef = collection(db, "trips");
  const q = query(tripsRef, where("memberUids", "array-contains", userUid));
  const querySnapshot = await getDocs(q);
  
  const trips = [];
  querySnapshot.forEach((docSnap) => {
    trips.push({ id: docSnap.id, ...docSnap.data() });
  });
  
  // 依建立時間排序 (最新在最前)
  return trips.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// 3. 透過 6 位邀請碼加入房間
export async function joinTripByCode(inviteCode, user) {
  const code = inviteCode.trim().toUpperCase();
  const tripsRef = collection(db, "trips");
  const q = query(tripsRef, where("inviteCode", "==", code));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    throw new Error("找不到此邀請碼對應的行程！");
  }

  const tripDoc = querySnapshot.docs[0];
  const tripData = tripDoc.data();

  if (!tripData.isInviteEnabled) {
    throw new Error("該行程管理員已暫停邀請碼加入！");
  }

  if (tripData.memberUids.includes(user.uid)) {
    return { id: tripDoc.id, alreadyJoined: true };
  }

  // 加入新成員
  const updatedMembers = { ...tripData.members };
  updatedMembers[user.uid] = {
    id: user.uid,
    name: user.name,
    avatar: user.avatar,
    role: "member",
    isCreator: false,
    seatOut: "",
    seatIn: ""
  };

  await updateDoc(doc(db, "trips", tripDoc.id), {
    memberUids: arrayUnion(user.uid),
    members: updatedMembers
  });

  return { id: tripDoc.id, alreadyJoined: false };
}
