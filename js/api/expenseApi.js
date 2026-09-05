// js/api/expenseApi.js
import { db } from "../config/firebase.js";
import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  updateDoc, 
  serverTimestamp, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. 新增一筆支出
export async function addExpense(tripId, expenseData) {
  const collRef = collection(db, "trips", tripId, "expenses");
  const newExp = {
    title: expenseData.title,
    amount: Number(expenseData.amount),
    type: expenseData.type, // 'kitty' (公費), 'advance' (代墊), 'taxi' (計程車分攤), 'personal' (個人代購)
    payerId: expenseData.payerId, // 付款人 uid 或 'kitty'
    payerName: expenseData.payerName,
    splitMembers: expenseData.splitMembers || [], // 參與分攤的成員 uid 清單
    date: expenseData.date || new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp()
  };
  const docRef = await addDoc(collRef, newExp);
  return { id: docRef.id, ...newExp };
}

// 2. 取得所有支出明細
export async function getExpenses(tripId) {
  const collRef = collection(db, "trips", tripId, "expenses");
  const q = query(collRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
}

// 3. 成員提交公費匯款紀錄
export async function submitPayment(tripId, paymentData) {
  const collRef = collection(db, "trips", tripId, "payments");
  const newPay = {
    uid: paymentData.uid,
    userName: paymentData.userName,
    amount: Number(paymentData.amount),
    code: paymentData.code,
    status: "pending", // 'pending' (待審核), 'approved' (已核對)
    date: paymentData.date || new Date().toISOString().split('T')[0],
    createdAt: serverTimestamp()
  };
  const docRef = await addDoc(collRef, newPay);
  return { id: docRef.id, ...newPay };
}

// 4. 取得所有公費繳交紀錄
export async function getPayments(tripId) {
  const collRef = collection(db, "trips", tripId, "payments");
  const q = query(collRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
}

// 5. 管理員審核通過匯款
export async function approvePayment(tripId, paymentId) {
  const docRef = doc(db, "trips", tripId, "payments", paymentId);
  await updateDoc(docRef, { status: "approved" });
}

// 6. 核心演算法：計算公費池狀態與最小化轉帳清算方案
export function calculateSettlement(membersMap, expenses, payments) {
  const memberList = Object.values(membersMap || {});
  const balances = {}; // uid -> 淨餘額 (+ 代表應收，- 代表應付)
  
  memberList.forEach(m => { balances[m.id] = 0; });

  let totalKittyPaid = 0; // 公費總入帳 (已審核通過)
  payments.forEach(p => {
    if (p.status === "approved") {
      totalKittyPaid += p.amount;
    }
  });

  let kittySpent = 0;   // 公費池已支出
  let totalAdvance = 0; // 個人代墊總額

  expenses.forEach(exp => {
    const amt = exp.amount;
    if (exp.type === "kitty") {
      kittySpent += amt;
    } else if (exp.type === "advance") {
      totalAdvance += amt;
      // 付款人 +amt
      if (balances[exp.payerId] !== undefined) balances[exp.payerId] += amt;
      // 全體均分
      const splitCount = memberList.length || 1;
      const perHead = amt / splitCount;
      memberList.forEach(m => { balances[m.id] -= perHead; });
    } else if (exp.type === "taxi") {
      totalAdvance += amt;
      if (balances[exp.payerId] !== undefined) balances[exp.payerId] += amt;
      // 指定搭乘人均分
      const splits = exp.splitMembers && exp.splitMembers.length ? exp.splitMembers : memberList.map(m => m.id);
      const perHead = amt / splits.length;
      splits.forEach(uid => { if (balances[uid] !== undefined) balances[uid] -= perHead; });
    } else if (exp.type === "personal") {
      totalAdvance += amt;
      if (balances[exp.payerId] !== undefined) balances[exp.payerId] += amt;
      const targetUid = (exp.splitMembers && exp.splitMembers[0]) || exp.payerId;
      if (balances[targetUid] !== undefined) balances[targetUid] -= amt;
    }
  });

  const kittyRemaining = totalKittyPaid - kittySpent;

  // 最小化轉帳演算法 (貪婪算法配對)
  const debtors = [];  // 應付款人
  const creditors = []; // 應收款人

  Object.entries(balances).forEach(([uid, bal]) => {
    const rounded = Math.round(bal);
    const m = membersMap[uid] || { name: "未知成員" };
    if (rounded < -1) debtors.push({ uid, name: m.name, amount: -rounded });
    else if (rounded > 1) creditors.push({ uid, name: m.name, amount: rounded });
  });

  const transfers = [];
  let dIdx = 0, cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settledAmt = Math.min(debtor.amount, creditor.amount);

    transfers.push({
      from: debtor.name,
      fromUid: debtor.uid,
      to: creditor.name,
      toUid: creditor.uid,
      amount: settledAmt
    });

    debtor.amount -= settledAmt;
    creditor.amount -= settledAmt;

    if (debtor.amount === 0) dIdx++;
    if (creditor.amount === 0) cIdx++;
  }

  return {
    totalKittyPaid,
    kittySpent,
    kittyRemaining,
    totalAdvance,
    transfers
  };
}
