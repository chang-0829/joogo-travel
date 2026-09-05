// js/pages/app.js
import { db } from "../config/firebase.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { subscribeAuthState } from "../api/authApi.js";
import { getTripFlight, saveTripFlight, defaultFlightData } from "../api/flightApi.js";
import { getTripHotels, saveTripHotels, defaultHotelsData } from "../api/hotelApi.js";
import { getAirlineTemplates } from "../api/templateApi.js";
import { 
  addExpense, 
  getExpenses, 
  submitPayment, 
  getPayments, 
  approvePayment, 
  calculateSettlement 
} from "../api/expenseApi.js";

// 動態真實登入使用者
let currentUser = {
  uid: null,
  name: "",
  avatar: ""
};

const urlParams = new URLSearchParams(window.location.search);
const currentTripId = urlParams.get("tripId");

let currentTripData = null;
let currentFlightData = defaultFlightData;
let currentHotelsList = defaultHotelsData;
let currentExpenses = [];
let currentPayments = [];
let airlineTemplates = [];
let activeUserId = null;

// 記帳狀態
let currentBkSubTab = 'expenses';
let currentExpFilter = 'all';

// 住宿狀態
let activeHotelIdx = 0;
let activeHotelSubTab = 'info';
let expandedHotelRooms = {};
let visiblePinRooms = {};
let roomIdxPendingRemove = null;

export function showToast(msg) {
  const toast = document.getElementById('toast-message');
  const toastText = document.getElementById('toast-text');
  if (toast && toastText) {
    toastText.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2200);
  }
}

function formatSlashDate(dStr) {
  return dStr ? dStr.replace(/-/g, '/') : '';
}

function calculateDaysAndNights(startStr, endStr) {
  if (!startStr || !endStr) return "1 天 0 夜";
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "1 天 0 夜";
  const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
  const nights = diffDays > 1 ? diffDays - 1 : 0;
  return `${diffDays} 天 ${nights} 夜`;
}

function calculateNightsOnly(checkInStr, checkOutStr) {
  if (!checkInStr || !checkOutStr) return 1;
  const start = new Date(checkInStr);
  const end = new Date(checkOutStr);
  const nights = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 1;
}

function calculateDuration(dep, arr) {
  if (!dep || !arr) return "3h 00m";
  const [sH, sM] = dep.split(':').map(Number);
  const [eH, eM] = arr.split(':').map(Number);
  let startM = sH * 60 + sM;
  let endM = eH * 60 + eM;
  if (endM < startM) endM += 24 * 60;
  const diff = endM - startM;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m < 10 ? '0' : ''}${m}m`;
}

// 初始化房間：整合真實身份與成員身分驗證
async function initRoom() {
  if (!currentTripId) {
    alert("無效的行程房間 ID！");
    window.location.href = "index.html";
    return;
  }

  try {
    airlineTemplates = await getAirlineTemplates();
  } catch (err) {
    console.warn("載入航司公版失敗：", err);
  }

  const tripDocRef = doc(db, "trips", currentTripId);
  onSnapshot(tripDocRef, async (docSnap) => {
    if (!docSnap.exists()) {
      alert("此行程房間已不存在！");
      window.location.href = "index.html";
      return;
    }

    const data = docSnap.data();

    // 防護關鍵：檢查當前登入者是否在該房間的成員清單中
    if (!data.memberUids || !data.memberUids.includes(currentUser.uid)) {
      alert("您並非此行程成員，無法進入！請向主揪索取 6 碼邀請碼加入。");
      window.location.href = "index.html";
      return;
    }

    currentTripData = { id: docSnap.id, ...data };
    renderRoomOverview();
    renderSeatsDisplay();

    try {
      currentFlightData = await getTripFlight(currentTripId);
      renderFlightDisplay();

      currentHotelsList = await getTripHotels(currentTripId);
      renderHotelOverviewList();

      await loadBookkeepingData();
    } catch (e) {
      console.warn("載入子細節失敗：", e);
    }
  }, (err) => {
    showToast("監聽房間失敗: " + err.message);
  });
}

function renderRoomOverview() {
  if (!currentTripData) return;
  const { title, country, startDate, endDate, coverImage, members, inviteCode } = currentTripData;

  document.getElementById('overview-title').innerText = title;
  document.getElementById('overview-country-tag').innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 text-brand-600"></i>${country}`;
  document.getElementById('overview-days-tag').innerText = calculateDaysAndNights(startDate, endDate);
  document.getElementById('overview-dates').innerText = `${formatSlashDate(startDate)} ~ ${formatSlashDate(endDate)}`;
  document.getElementById('overview-cover-img').src = coverImage;

  const partnerList = members ? Object.values(members) : [];
  document.getElementById('partner-count-display').innerText = partnerList.length;

  document.getElementById('partner-list-container').innerHTML = partnerList.map(p => `
    <div class="flex items-center gap-2.5 p-2 bg-slate-50 rounded-xl">
      <img src="${p.avatar}" class="w-7 h-7 rounded-full object-cover shrink-0">
      <div class="min-w-0">
        <div class="text-xs font-bold text-slate-800 truncate">${p.name}${p.id === currentUser.uid ? ' (我)' : ''}</div>
        <div class="text-[10px] ${p.role === 'admin' ? 'text-brand-600 font-bold' : 'text-slate-400'}">
          ${p.role === 'admin' ? '👑 管理員' : '夥伴'}
        </div>
      </div>
    </div>
  `).join('');

  const myRole = members && members[activeUserId] ? members[activeUserId].role : 'member';
  const adminSection = document.getElementById('admin-control-section');
  if (myRole === 'admin') adminSection.classList.remove('hidden');
  else adminSection.classList.add('hidden');

  document.getElementById('admin-trip-title').value = title;
  document.getElementById('admin-trip-country').value = country;
  document.getElementById('admin-trip-startdate').value = startDate;
  document.getElementById('admin-trip-enddate').value = endDate;
  document.getElementById('admin-trip-cover').value = coverImage;
  document.getElementById('admin-invite-code-val').innerText = inviteCode || '------';

  if (window.lucide) lucide.createIcons();
}

async function handleSaveTripSettings(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerText = "更新中...";

  try {
    const updatedData = {
      title: document.getElementById('admin-trip-title').value,
      country: document.getElementById('admin-trip-country').value,
      startDate: document.getElementById('admin-trip-startdate').value,
      endDate: document.getElementById('admin-trip-enddate').value,
      coverImage: document.getElementById('admin-trip-cover').value
    };

    const tripDocRef = doc(db, "trips", currentTripId);
    await updateDoc(tripDocRef, updatedData);

    document.getElementById('admin-trip-modal').classList.add('hidden');
    showToast("行程設定已更新！");
  } catch (err) {
    showToast("更新失敗：" + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "更新行程";
  }
}

// ==================== 航班模組 ====================

function renderFlightDisplay() {
  const { outbound, inbound } = currentFlightData;

  document.getElementById('display-flight-out-airline').innerText = outbound.airline;
  document.getElementById('display-flight-out-no').innerText = outbound.flightNo;
  document.getElementById('display-flight-out-pnr').innerText = outbound.pnr || '------';
  document.getElementById('display-flight-out-deptime').innerText = outbound.depTime || '08:50';
  document.getElementById('display-flight-out-arrtime').innerText = outbound.arrTime || '13:15';
  document.getElementById('display-flight-out-depairport').innerText = outbound.depAirport || '桃園 (TPE)';
  document.getElementById('display-flight-out-arrairport').innerText = outbound.arrAirport || '成田 (NRT)';
  document.getElementById('display-flight-out-duration').innerText = outbound.duration || calculateDuration(outbound.depTime, outbound.arrTime);
  document.getElementById('display-flight-out-terminal').innerText = outbound.terminal || '第 2 航廈';
  document.getElementById('display-flight-out-counter').innerText = outbound.counter || '12 號櫃檯';
  document.getElementById('display-flight-out-checkintime').innerText = outbound.checkinTime || '06:50';
  document.getElementById('display-flight-out-gate').innerText = outbound.gate || 'A7';
  document.getElementById('display-flight-out-boarding').innerText = outbound.boardingTime || '08:10';

  document.getElementById('display-bag-out-checked-quota').innerText = outbound.baggage?.checkedQuota || '2 件 (每件 23 kg)';
  document.getElementById('display-bag-out-checked-dim').innerText = `尺寸限制：${outbound.baggage?.checkedDim || '三邊總和 ≤ 158 cm'}`;
  document.getElementById('display-bag-out-carry-quota').innerText = outbound.baggage?.carryQuota || '1 件 (7 kg)';
  document.getElementById('display-bag-out-carry-dim').innerText = `尺寸限制：${outbound.baggage?.carryDim || '55 x 40 x 23 cm'}`;
  document.getElementById('display-bag-out-personal-quota').innerText = outbound.baggage?.personalQuota || '1 件 (隨身包)';
  document.getElementById('display-bag-out-personal-dim').innerText = `尺寸限制：${outbound.baggage?.personalDim || '40 x 30 x 10 cm'}`;

  document.getElementById('display-flight-in-airline').innerText = inbound.airline;
  document.getElementById('display-flight-in-no').innerText = inbound.flightNo;
  document.getElementById('display-flight-in-pnr').innerText = inbound.pnr || '------';
  document.getElementById('display-flight-in-deptime').innerText = inbound.depTime || '14:30';
  document.getElementById('display-flight-in-arrtime').innerText = inbound.arrTime || '17:15';
  document.getElementById('display-flight-in-depairport').innerText = inbound.depAirport || '成田 (NRT)';
  document.getElementById('display-flight-in-arrairport').innerText = inbound.arrAirport || '桃園 (TPE)';
  document.getElementById('display-flight-in-duration').innerText = inbound.duration || calculateDuration(inbound.depTime, inbound.arrTime);
  document.getElementById('display-flight-in-terminal').innerText = inbound.terminal || '第 2 航廈';
  document.getElementById('display-flight-in-counter').innerText = inbound.counter || 'K 櫃檯';
  document.getElementById('display-flight-in-checkintime').innerText = inbound.checkinTime || '12:30';
  document.getElementById('display-flight-in-gate').innerText = inbound.gate || '71';
  document.getElementById('display-flight-in-boarding').innerText = inbound.boardingTime || '13:50';

  document.getElementById('display-bag-in-checked-quota').innerText = inbound.baggage?.checkedQuota || '2 件 (每件 23 kg)';
  document.getElementById('display-bag-in-checked-dim').innerText = `尺寸限制：${inbound.baggage?.checkedDim || '三邊總和 ≤ 158 cm'}`;
  document.getElementById('display-bag-in-carry-quota').innerText = inbound.baggage?.carryQuota || '1 件 (7 kg)';
  document.getElementById('display-bag-in-carry-dim').innerText = `尺寸限制：${inbound.baggage?.carryDim || '55 x 40 x 23 cm'}`;
  document.getElementById('display-bag-in-personal-quota').innerText = inbound.baggage?.personalQuota || '1 件 (隨身包)';
  document.getElementById('display-bag-in-personal-dim').innerText = `尺寸限制：${inbound.baggage?.personalDim || '40 x 30 x 10 cm'}`;

  if (window.lucide) lucide.createIcons();
}

function renderSeatsDisplay() {
  if (!currentTripData || !currentTripData.members) return;
  const mySelf = currentTripData.members[currentUser.uid];
  document.getElementById('display-my-out-seat').innerText = mySelf?.seatOut || '未指定';
  document.getElementById('display-my-in-seat').innerText = mySelf?.seatIn || '未指定';
}

function openSeatEggModal(type) {
  const container = document.getElementById('seat-egg-list-container');
  const title = document.getElementById('seat-egg-title');
  title.innerText = type === 'out' ? '去程同行夥伴座位分配' : '回程同行夥伴座位分配';

  const partnerList = currentTripData?.members ? Object.values(currentTripData.members) : [];
  container.innerHTML = partnerList.map(p => `
    <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
      <div class="flex items-center gap-2">
        <img src="${p.avatar}" class="w-7 h-7 rounded-full object-cover">
        <span class="text-xs font-bold text-slate-800">${p.name} ${p.id === currentUser.uid ? '(我)' : ''}</span>
      </div>
      <span class="text-xs font-mono font-bold text-slate-800">${(type === 'out' ? p.seatOut : p.seatIn) || '未指定'}</span>
    </div>
  `).join('');

  document.getElementById('seat-egg-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function openAdminFlightModal() {
  const { outbound, inbound } = currentFlightData;

  document.getElementById('input-out-airline').value = outbound.airline;
  document.getElementById('input-out-flightno').value = outbound.flightNo;
  document.getElementById('input-out-pnr').value = outbound.pnr || '';
  document.getElementById('input-out-depairport').value = outbound.depAirport || '桃園 (TPE)';
  document.getElementById('input-out-arrairport').value = outbound.arrAirport || '成田 (NRT)';
  document.getElementById('input-out-deptime').value = outbound.depTime || '08:50';
  document.getElementById('input-out-arrtime').value = outbound.arrTime || '13:15';
  document.getElementById('input-out-terminal').value = outbound.terminal || '第 2 航廈';
  document.getElementById('input-out-counter').value = outbound.counter || '12 號櫃檯';
  document.getElementById('input-out-checkintime').value = outbound.checkinTime || '06:50';
  document.getElementById('input-out-boarding').value = outbound.boardingTime || '08:10';
  document.getElementById('input-out-gate').value = outbound.gate || 'A7';

  document.getElementById('input-bag-out-checked-quota').value = outbound.baggage?.checkedQuota || '';
  document.getElementById('input-bag-out-checked-dim').value = outbound.baggage?.checkedDim || '';
  document.getElementById('input-bag-out-carry-quota').value = outbound.baggage?.carryQuota || '';
  document.getElementById('input-bag-out-carry-dim').value = outbound.baggage?.carryDim || '';
  document.getElementById('input-bag-out-personal-quota').value = outbound.baggage?.personalQuota || '';
  document.getElementById('input-bag-out-personal-dim').value = outbound.baggage?.personalDim || '';

  document.getElementById('input-in-airline').value = inbound.airline;
  document.getElementById('input-in-flightno').value = inbound.flightNo;
  document.getElementById('input-in-pnr').value = inbound.pnr || '';
  document.getElementById('input-in-depairport').value = inbound.depAirport || '成田 (NRT)';
  document.getElementById('input-in-arrairport').value = inbound.arrAirport || '桃園 (TPE)';
  document.getElementById('input-in-deptime').value = inbound.depTime || '14:30';
  document.getElementById('input-in-arrtime').value = inbound.arrTime || '17:15';
  document.getElementById('input-in-terminal').value = inbound.terminal || '第 2 航廈';
  document.getElementById('input-in-counter').value = inbound.counter || 'K 櫃檯';
  document.getElementById('input-in-checkintime').value = inbound.checkinTime || '12:30';
  document.getElementById('input-in-boarding').value = inbound.boardingTime || '13:50';
  document.getElementById('input-in-gate').value = inbound.gate || '71';

  document.getElementById('input-bag-in-checked-quota').value = inbound.baggage?.checkedQuota || '';
  document.getElementById('input-bag-in-checked-dim').value = inbound.baggage?.checkedDim || '';
  document.getElementById('input-bag-in-carry-quota').value = inbound.baggage?.carryQuota || '';
  document.getElementById('input-bag-in-carry-dim').value = inbound.baggage?.carryDim || '';
  document.getElementById('input-bag-in-personal-quota').value = inbound.baggage?.personalQuota || '';
  document.getElementById('input-bag-in-personal-dim').value = inbound.baggage?.personalDim || '';

  const partnerList = currentTripData?.members ? Object.values(currentTripData.members) : [];
  document.getElementById('admin-seats-inputs-container').innerHTML = partnerList.map(p => `
    <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
      <div class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
        <img src="${p.avatar}" class="w-5 h-5 rounded-full object-cover">
        <span>${p.name}</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <input type="text" id="seat-out-${p.id}" value="${p.seatOut || ''}" placeholder="去程座位 (如 12A)" class="h-[36px] px-2.5 border border-slate-200 rounded-lg text-xs font-bold uppercase">
        <input type="text" id="seat-in-${p.id}" value="${p.seatIn || ''}" placeholder="回程座位 (如 12A)" class="h-[36px] px-2.5 border border-slate-200 rounded-lg text-xs font-bold uppercase">
      </div>
    </div>
  `).join('');

  document.getElementById('admin-flight-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function applyAirlineTemplate(dir, code) {
  const t = airlineTemplates.find(item => item.id === code);
  if (!t) return;

  if (dir === 'out') {
    document.getElementById('input-out-airline').value = t.name.split(' ')[0];
    document.getElementById('input-bag-out-checked-quota').value = t.checkedQuota;
    document.getElementById('input-bag-out-checked-dim').value = t.checkedDim;
    document.getElementById('input-bag-out-carry-quota').value = t.carryQuota;
    document.getElementById('input-bag-out-carry-dim').value = t.carryDim;
    document.getElementById('input-bag-out-personal-quota').value = t.personalQuota;
    document.getElementById('input-bag-out-personal-dim').value = t.personalDim;
  } else {
    document.getElementById('input-in-airline').value = t.name.split(' ')[0];
    document.getElementById('input-bag-in-checked-quota').value = t.checkedQuota;
    document.getElementById('input-bag-in-checked-dim').value = t.checkedDim;
    document.getElementById('input-bag-in-carry-quota').value = t.carryQuota;
    document.getElementById('input-bag-in-carry-dim').value = t.carryDim;
    document.getElementById('input-bag-in-personal-quota').value = t.personalQuota;
    document.getElementById('input-bag-in-personal-dim').value = t.personalDim;
  }
  showToast(`已自動套入 ${t.name} 之行李規範！`);
}

async function handleSaveFlightSettings(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-admin-flight');
  btn.disabled = true;
  btn.innerText = "儲存中...";

  try {
    const updatedFlight = {
      outbound: {
        airline: document.getElementById('input-out-airline').value,
        flightNo: document.getElementById('input-out-flightno').value,
        pnr: document.getElementById('input-out-pnr').value,
        depAirport: document.getElementById('input-out-depairport').value,
        arrAirport: document.getElementById('input-out-arrairport').value,
        depTime: document.getElementById('input-out-deptime').value,
        arrTime: document.getElementById('input-out-arrtime').value,
        duration: calculateDuration(document.getElementById('input-out-deptime').value, document.getElementById('input-out-arrtime').value),
        terminal: document.getElementById('input-out-terminal').value,
        counter: document.getElementById('input-out-counter').value,
        checkinTime: document.getElementById('input-out-checkintime').value,
        boardingTime: document.getElementById('input-out-boarding').value,
        gate: document.getElementById('input-out-gate').value,
        baggage: {
          checkedQuota: document.getElementById('input-bag-out-checked-quota').value,
          checkedDim: document.getElementById('input-bag-out-checked-dim').value,
          carryQuota: document.getElementById('input-bag-out-carry-quota').value,
          carryDim: document.getElementById('input-bag-out-carry-dim').value,
          personalQuota: document.getElementById('input-bag-out-personal-quota').value,
          personalDim: document.getElementById('input-bag-out-personal-dim').value
        }
      },
      inbound: {
        airline: document.getElementById('input-in-airline').value,
        flightNo: document.getElementById('input-in-flightno').value,
        pnr: document.getElementById('input-in-pnr').value,
        depAirport: document.getElementById('input-in-depairport').value,
        arrAirport: document.getElementById('input-in-arrairport').value,
        depTime: document.getElementById('input-in-deptime').value,
        arrTime: document.getElementById('input-in-arrtime').value,
        duration: calculateDuration(document.getElementById('input-in-deptime').value, document.getElementById('input-in-arrtime').value),
        terminal: document.getElementById('input-in-terminal').value,
        counter: document.getElementById('input-in-counter').value,
        checkinTime: document.getElementById('input-in-checkintime').value,
        boardingTime: document.getElementById('input-in-boarding').value,
        gate: document.getElementById('input-in-gate').value,
        baggage: {
          checkedQuota: document.getElementById('input-bag-in-checked-quota').value,
          checkedDim: document.getElementById('input-bag-in-checked-dim').value,
          carryQuota: document.getElementById('input-bag-in-carry-quota').value,
          carryDim: document.getElementById('input-bag-in-carry-dim').value,
          personalQuota: document.getElementById('input-bag-in-personal-quota').value,
          personalDim: document.getElementById('input-bag-in-personal-dim').value
        }
      }
    };

    await saveTripFlight(currentTripId, updatedFlight);
    currentFlightData = updatedFlight;
    renderFlightDisplay();

    if (currentTripData?.members) {
      const updatedMembers = { ...currentTripData.members };
      Object.keys(updatedMembers).forEach(uid => {
        const outInput = document.getElementById(`seat-out-${uid}`);
        const inInput = document.getElementById(`seat-in-${uid}`);
        if (outInput) updatedMembers[uid].seatOut = outInput.value;
        if (inInput) updatedMembers[uid].seatIn = inInput.value;
      });
      await updateDoc(doc(db, "trips", currentTripId), { members: updatedMembers });
    }

    document.getElementById('admin-flight-modal').classList.add('hidden');
    showToast("航班與座位設定已儲存！");
  } catch (err) {
    showToast("儲存失敗：" + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "更新設定";
  }
}

function switchFlightSubTab(tab) {
  const tabs = ['out', 'in', 'seats'];
  tabs.forEach(t => {
    const btn = document.getElementById(`subtab-admin-${t}`);
    const sec = document.getElementById(`section-admin-${t}`);
    if (t === tab) {
      btn.className = "flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-2xs transition-all";
      sec.classList.remove('hidden');
    } else {
      btn.className = "flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-600 transition-all";
      sec.classList.add('hidden');
    }
  });
}

// ==================== 記帳與清算模組 ====================

async function loadBookkeepingData() {
  if (!currentTripId) return;
  try {
    currentExpenses = await getExpenses(currentTripId);
    currentPayments = await getPayments(currentTripId);
    renderBookkeepingUI();
  } catch (err) {
    console.error("載入記帳數據失敗", err);
  }
}

function renderBookkeepingUI() {
  const settlement = calculateSettlement(currentTripData?.members, currentExpenses, currentPayments);

  document.getElementById('bk-kitty-remaining').innerText = `NT$ ${settlement.kittyRemaining.toLocaleString()}`;
  document.getElementById('bk-total-kitty').innerText = `NT$ ${settlement.totalKittyPaid.toLocaleString()}`;
  document.getElementById('bk-kitty-spent').innerText = `NT$ ${settlement.kittySpent.toLocaleString()}`;
  document.getElementById('bk-total-advance').innerText = `NT$ ${settlement.totalAdvance.toLocaleString()}`;

  let myPaid = 0;
  currentPayments.forEach(p => {
    if (p.uid === currentUser.uid && p.status === 'approved') myPaid += p.amount;
  });
  document.getElementById('my-paid-kitty-amount').innerText = `NT$ ${myPaid.toLocaleString()}`;

  renderExpensesList();
  renderPaymentsList();
  renderSettlementList(settlement.transfers);
}

function renderExpensesList() {
  const container = document.getElementById('expense-list-container');
  if (!container) return;

  const filtered = currentExpenses.filter(e => {
    if (currentExpFilter === 'all') return true;
    return e.type === currentExpFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-xs text-slate-400">尚無符合此條件的支出記錄</div>`;
    return;
  }

  container.innerHTML = filtered.map(exp => {
    let badge = '';
    if (exp.type === 'kitty') badge = `<span class="px-2 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-800 rounded">公費扣款</span>`;
    else if (exp.type === 'advance') badge = `<span class="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 rounded">成員代墊</span>`;
    else if (exp.type === 'taxi') badge = `<span class="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-800 rounded">搭車分攤</span>`;
    else badge = `<span class="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded">個人私用</span>`;

    return `
      <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            ${badge}
            <span class="text-xs text-slate-400 font-mono">${exp.date}</span>
          </div>
          <h4 class="font-bold text-sm text-slate-900">${exp.title}</h4>
        </div>
        <div class="text-right">
          <div class="font-bold text-sm text-slate-900 font-mono">NT$ ${exp.amount.toLocaleString()}</div>
          <div class="text-[11px] text-slate-400">付款人: ${exp.payerName}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPaymentsList() {
  const container = document.getElementById('payment-list-container');
  if (!container) return;

  if (currentPayments.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-xs text-slate-400">尚無公費繳交紀錄</div>`;
    return;
  }

  const isMeAdmin = currentTripData?.members && currentTripData.members[activeUserId]?.role === 'admin';

  container.innerHTML = currentPayments.map(p => {
    const isApproved = p.status === 'approved';
    const statusBadge = isApproved
      ? `<span class="px-2.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">已核對通過</span>`
      : `<span class="px-2.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 rounded-full border border-amber-100">待審核</span>`;

    const approveBtn = (isMeAdmin && !isApproved)
      ? `<button onclick="window.handleApprovePayment('${p.id}')" class="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl active:scale-95 transition-all shadow-xs">通過審核</button>`
      : '';

    return `
      <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-900">${p.userName}</span>
            ${statusBadge}
          </div>
          <p class="text-xs text-slate-400 font-mono">轉帳末碼/備註: ${p.code} (${p.date})</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="font-bold text-sm text-slate-900 font-mono">NT$ ${p.amount.toLocaleString()}</div>
          ${approveBtn}
        </div>
      </div>
    `;
  }).join('');
}

function renderSettlementList(transfers) {
  const container = document.getElementById('settlement-cards-container');
  if (!container) return;

  if (!transfers || transfers.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-xs text-slate-400">目前所有人帳目平衡，無須轉帳清算！</div>`;
    return;
  }

  container.innerHTML = transfers.map(t => `
    <div class="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-200/80">
      <div class="flex items-center gap-2">
        <span class="font-bold text-xs text-slate-800">${t.from}</span>
        <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-slate-400"></i>
        <span class="font-bold text-xs text-brand-600">${t.to}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-bold text-sm text-slate-900 font-mono">NT$ ${t.amount.toLocaleString()}</span>
        <button onclick="navigator.clipboard.writeText('${t.amount}'); window.showToast('已複製轉帳金額');" class="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-2xs active:scale-95">複製金額</button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

window.handleApprovePayment = async (payId) => {
  try {
    await approvePayment(currentTripId, payId);
    showToast("已通過匯款審核！公費池已更新。");
    await loadBookkeepingData();
  } catch (err) {
    showToast("審核失敗: " + err.message);
  }
};

// ==================== 住宿模組 ====================

export function renderHotelOverviewList() {
  const container = document.getElementById('hotel-cards-list-container');
  const tabsHeader = document.getElementById('hotel-tabs-header');
  if (!container) return;

  if (tabsHeader) {
    if (currentHotelsList.length > 1) {
      tabsHeader.classList.remove('hidden');
      tabsHeader.innerHTML = currentHotelsList.map((h, i) => `
        <button onclick="window.switchHotelTab(${i})" class="flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all text-center whitespace-nowrap ${i === activeHotelIdx ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}">
          ${h.nameZh} (${calculateNightsOnly(h.checkInDate, h.checkOutDate)}晚)
        </button>
      `).join('');
    } else {
      tabsHeader.classList.add('hidden');
    }
  }

  if (activeHotelIdx >= currentHotelsList.length) activeHotelIdx = 0;
  const h = currentHotelsList[activeHotelIdx];
  if (!h) {
    container.innerHTML = '<div class="text-center py-8 text-xs text-slate-400">尚未設定住宿</div>';
    return;
  }

  const isExpanded = !!expandedHotelRooms[h.id];
  const partnerList = currentTripData?.members ? Object.values(currentTripData.members) : [];

  container.innerHTML = `
    <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3.5">
      <div>
        <h4 class="text-sm sm:text-base font-bold text-slate-900">${h.nameZh}</h4>
        ${h.nameForeign ? `<div class="text-xs text-slate-500 font-medium mt-0.5">${h.nameForeign}</div>` : ''}
      </div>

      <div class="space-y-1.5 text-xs text-slate-600">
        <div class="flex items-center gap-1.5">
          <i data-lucide="map-pin" class="w-4 h-4 text-slate-400 shrink-0"></i>
          <span class="font-medium text-slate-800">${h.addressZh}</span>
          <button onclick="navigator.clipboard.writeText('${h.addressForeign || h.addressZh}'); window.showToast('外語地址已複製');" title="複製外語地址" class="p-1 text-slate-400 hover:text-brand-600">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        ${h.phone ? `
          <div class="flex items-center gap-1.5">
            <i data-lucide="phone" class="w-4 h-4 text-slate-400 shrink-0"></i>
            <span class="font-medium text-slate-800">${h.phone}</span>
          </div>
        ` : ''}
        <div class="flex items-center gap-2">
          <i data-lucide="file-check" class="w-4 h-4 text-slate-400 shrink-0"></i>
          <span>訂房編號：<span class="font-bold text-slate-800">${h.refNo}</span></span>
        </div>
      </div>

      ${(h.gateType !== 'none' && h.gateCode) ? `
        <div class="p-3 bg-slate-50/90 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs">
          <div class="flex items-center gap-2.5">
            <i data-lucide="key-round" class="w-4 h-4 text-slate-600"></i>
            <div>
              <span class="text-[10px] text-slate-400 block leading-tight">大門通用密碼</span>
              <span class="font-bold text-slate-900 text-sm">${h.gateCode}</span>
            </div>
          </div>
          <button onclick="navigator.clipboard.writeText('${h.gateCode}'); window.showToast('大門密碼已複製');" class="p-1.5 text-slate-400 hover:text-brand-600">
            <i data-lucide="copy" class="w-4 h-4"></i>
          </button>
        </div>
      ` : ''}

      <div class="grid grid-cols-2 gap-2 bg-slate-50 rounded-xl p-2.5 text-center text-xs">
        <div class="border-r border-slate-200/80 pr-1">
          <div class="text-[10px] text-slate-400 font-medium">入住 Check-in</div>
          <div class="font-bold text-slate-800 mt-0.5">${formatSlashDate(h.checkInDate)} ${h.checkInTime} 後</div>
        </div>
        <div class="pl-1">
          <div class="text-[10px] text-slate-400 font-medium">退房 Check-out</div>
          <div class="font-bold text-slate-800 mt-0.5">${formatSlashDate(h.checkOutDate)} ${h.checkOutTime} 前</div>
        </div>
      </div>

      <div class="pt-1 space-y-2">
        <button onclick="window.toggleHotelRoomsCollapse('${h.id}')" class="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/60 text-xs font-bold text-slate-700">
          <span class="flex items-center gap-1.5">
            <i data-lucide="door-closed" class="w-4 h-4 text-brand-600"></i>
            房間分配與密碼 (${h.rooms?.length || 0} 間)
          </span>
          <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-slate-400"></i>
        </button>

        ${isExpanded ? `
          <div class="space-y-2 pt-1">
            ${(h.rooms || []).map(r => {
              const isPinVisible = visiblePinRooms[r.id];
              const assignedPartners = partnerList.filter(p => (r.assignedPartnerIds || []).includes(p.id));

              return `
              <div class="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 text-xs font-bold bg-slate-800 text-white rounded-md">房號 ${r.roomNo}</span>
                    <span class="text-xs font-bold text-slate-800">${r.roomType || '標準房'}</span>
                  </div>
                  ${r.entryType === 'code' ? `
                    <button onclick="window.togglePinVisibility('${r.id}')" class="text-slate-400 hover:text-slate-600 text-[11px] font-semibold flex items-center gap-1">
                      <i data-lucide="${isPinVisible ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
                      <span>${isPinVisible ? '隱藏密碼' : '顯示密碼'}</span>
                    </button>
                  ` : ''}
                </div>

                <div class="flex items-center gap-1.5 text-xs text-slate-500">
                  <span class="text-[11px] font-medium text-slate-400">入住成員：</span>
                  <div class="flex items-center gap-1 flex-wrap">
                    ${assignedPartners.length > 0 ? assignedPartners.map(p => `
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700">
                        <img src="${p.avatar}" class="w-3.5 h-3.5 rounded-full object-cover">
                        ${p.name}
                      </span>
                    `).join('') : '<span class="text-[11px] text-slate-400 italic">未指派住客</span>'}
                  </div>
                </div>

                ${r.entryType === 'code' ? `
                  <div class="bg-white p-2 rounded-lg border border-slate-200/80 flex items-center justify-between text-xs">
                    <div>
                      <span class="text-slate-400 mr-2">房間密碼</span>
                      <span class="font-bold text-slate-900">${isPinVisible ? r.roomCode : '••••••'}</span>
                    </div>
                    <button onclick="navigator.clipboard.writeText('${r.roomCode}'); window.showToast('房間密碼已複製');" class="text-slate-400 hover:text-brand-600 p-1">
                      <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                    </button>
                  </div>
                ` : `
                  <div class="p-2 bg-amber-50/60 rounded-lg border border-amber-100 text-[11px] text-amber-900 flex items-center gap-1.5 font-bold">
                    <i data-lucide="info" class="w-3.5 h-3.5 text-amber-600 shrink-0"></i>
                    <span>${r.entryType === 'card' ? '感應房卡' : '實體鑰匙'}請於櫃檯辦理入住時領取。</span>
                  </div>
                `}
              </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

window.switchHotelTab = (idx) => { activeHotelIdx = idx; renderHotelOverviewList(); };
window.toggleHotelRoomsCollapse = (id) => { expandedHotelRooms[id] = !expandedHotelRooms[id]; renderHotelOverviewList(); };
window.togglePinVisibility = (id) => { visiblePinRooms[id] = !visiblePinRooms[id]; renderHotelOverviewList(); };
window.showToast = showToast;

function openAdminHotelModal() {
  activeHotelSubTab = 'info';
  renderAdminHotelDropdown();
  renderAdminSingleHotelForm();
  document.getElementById('admin-hotel-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function renderAdminHotelDropdown() {
  const selectEl = document.getElementById('admin-hotel-select');
  if (!selectEl) return;
  selectEl.innerHTML = currentHotelsList.map((h, idx) => `
    <option value="${idx}" ${idx === activeHotelIdx ? 'selected' : ''}>${h.nameZh}</option>
  `).join('');
}

function renderAdminSingleHotelForm() {
  const container = document.getElementById('admin-hotel-single-editor-container');
  if (!container) return;

  const h = currentHotelsList[activeHotelIdx];
  if (!h) return;

  const occupiedPartnerMap = {};
  (h.rooms || []).forEach(r => {
    (r.assignedPartnerIds || []).forEach(pId => {
      occupiedPartnerMap[pId] = r.roomNo;
    });
  });

  const partnerList = currentTripData?.members ? Object.values(currentTripData.members) : [];

  if (activeHotelSubTab === 'info') {
    container.innerHTML = `
      <div class="space-y-3 pt-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-800">基本住宿資訊</span>
          ${currentHotelsList.length > 1 ? `
            <button type="button" id="btn-ask-remove-hotel" class="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> 刪除此住宿
            </button>
          ` : ''}
        </div>

        <div>
          <label class="block text-[11px] font-bold text-slate-600 mb-1">飯店中文名稱</label>
          <input type="text" id="admin-h-nameZh" value="${h.nameZh}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold">
        </div>

        <div>
          <label class="block text-[11px] font-bold text-slate-600 mb-1">外語名稱 (英文/日文)</label>
          <input type="text" id="admin-h-nameForeign" value="${h.nameForeign || ''}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs">
        </div>

        <div>
          <label class="block text-[11px] font-bold text-slate-600 mb-1">中文地址</label>
          <input type="text" id="admin-h-addressZh" value="${h.addressZh}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs">
        </div>

        <div>
          <label class="block text-[11px] font-bold text-slate-600 mb-1">外語地址 (計程車/導航用)</label>
          <input type="text" id="admin-h-addressForeign" value="${h.addressForeign || ''}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs">
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">連絡電話</label>
            <input type="text" id="admin-h-phone" value="${h.phone || ''}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs">
          </div>
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">訂房編號</label>
            <input type="text" id="admin-h-refNo" value="${h.refNo}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">Check-in 日期/時間</label>
            <div class="grid grid-cols-2 gap-1">
              <input type="date" id="admin-h-checkinDate" value="${h.checkInDate}" class="h-[40px] px-1.5 bg-white border border-slate-200 rounded-lg text-xs">
              <input type="time" id="admin-h-checkinTime" value="${h.checkInTime}" class="h-[40px] px-1.5 bg-white border border-slate-200 rounded-lg text-xs">
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">Check-out 日期/時間</label>
            <div class="grid grid-cols-2 gap-1">
              <input type="date" id="admin-h-checkoutDate" value="${h.checkOutDate}" class="h-[40px] px-1.5 bg-white border border-slate-200 rounded-lg text-xs">
              <input type="time" id="admin-h-checkoutTime" value="${h.checkOutTime}" class="h-[40px] px-1.5 bg-white border border-slate-200 rounded-lg text-xs">
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">大樓門禁</label>
            <select id="admin-h-gateType" class="w-full h-[40px] px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold">
              <option value="code" ${h.gateType === 'code' ? 'selected' : ''}>需大門密碼</option>
              <option value="none" ${h.gateType === 'none' ? 'selected' : ''}>自由進出/無門禁</option>
            </select>
          </div>
          <div id="admin-h-gateCode-box" class="${h.gateType === 'none' ? 'hidden' : ''}">
            <label class="block text-[11px] font-bold text-slate-600 mb-1">大門密碼</label>
            <input type="text" id="admin-h-gateCode" value="${h.gateCode || ''}" class="w-full h-[40px] px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold font-mono">
          </div>
        </div>
      </div>
    `;

    document.getElementById('admin-h-gateType').onchange = (e) => {
      document.getElementById('admin-h-gateCode-box').classList.toggle('hidden', e.target.value === 'none');
    };

    if (document.getElementById('btn-ask-remove-hotel')) {
      document.getElementById('btn-ask-remove-hotel').onclick = () => {
        document.getElementById('confirm-remove-hotel-name').innerText = h.nameZh;
        document.getElementById('confirm-remove-hotel-modal').classList.remove('hidden');
      };
    }
  } else {
    container.innerHTML = `
      <div class="space-y-3 pt-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-800">房間清單 (${h.rooms?.length || 0} 間)</span>
          <button type="button" id="btn-add-room" class="px-2.5 py-1.5 text-xs font-bold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-xl flex items-center gap-1">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> 新增房間
          </button>
        </div>

        <div class="space-y-3">
          ${(h.rooms || []).map((r, rIdx) => `
            <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 relative">
              ${(h.rooms.length > 1) ? `
                <button type="button" onclick="window.askRemoveRoom(${rIdx})" class="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center absolute -top-2 -right-2 shadow-xs">
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">房號</label>
                  <input type="text" id="admin-r-no-${rIdx}" value="${r.roomNo}" class="w-full h-[36px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono">
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">房型名稱</label>
                  <input type="text" id="admin-r-type-${rIdx}" value="${r.roomType || ''}" class="w-full h-[36px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">開鎖方式</label>
                  <select id="admin-r-entry-${rIdx}" class="w-full h-[36px] px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold">
                    <option value="code" ${r.entryType === 'code' ? 'selected' : ''}>密碼鎖</option>
                    <option value="card" ${r.entryType === 'card' ? 'selected' : ''}>感應房卡</option>
                    <option value="key" ${r.entryType === 'key' ? 'selected' : ''}>實體鑰匙</option>
                  </select>
                </div>
                <div id="admin-r-code-box-${rIdx}" class="${r.entryType !== 'code' ? 'hidden' : ''}">
                  <label class="block text-[10px] font-bold text-slate-500 mb-0.5">房間通行密碼</label>
                  <input type="text" id="admin-r-code-${rIdx}" value="${r.roomCode || ''}" class="w-full h-[36px] px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold font-mono">
                </div>
              </div>

              <div>
                <label class="block text-[10px] font-bold text-slate-500 mb-1">指派住客 (Ctrl/Cmd 可複選)</label>
                <select id="admin-r-partners-${rIdx}" multiple class="w-full text-xs font-medium border border-slate-200 rounded-xl p-2 bg-white text-slate-800 min-h-[80px]">
                  ${partnerList.map(p => {
                    const isAssignedHere = (r.assignedPartnerIds || []).includes(p.id);
                    const occupiedOtherRoom = occupiedPartnerMap[p.id];
                    const isOccupiedElseWhere = occupiedOtherRoom && occupiedOtherRoom !== r.roomNo && !isAssignedHere;

                    return `
                      <option value="${p.id}" ${isAssignedHere ? 'selected' : ''} ${isOccupiedElseWhere ? 'disabled' : ''} class="${isOccupiedElseWhere ? 'text-slate-300 italic' : 'text-slate-800 font-bold'}">
                        ${p.name} ${isOccupiedElseWhere ? `(已在房號 ${occupiedOtherRoom})` : (p.id === currentUser.uid ? '(我)' : '')}
                      </option>
                    `;
                  }).join('')}
                </select>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btn-add-room').onclick = () => {
      h.rooms.push({
        id: `r_${Date.now()}`,
        roomNo: `${(h.rooms.length + 1) * 101}`,
        roomType: "標準雙人房",
        entryType: "code",
        roomCode: "1234",
        assignedPartnerIds: []
      });
      renderAdminSingleHotelForm();
    };

    (h.rooms || []).forEach((r, idx) => {
      const selectEntry = document.getElementById(`admin-r-entry-${idx}`);
      const codeBox = document.getElementById(`admin-r-code-box-${idx}`);
      if (selectEntry && codeBox) {
        selectEntry.onchange = (e) => codeBox.classList.toggle('hidden', e.target.value !== 'code');
      }
    });
  }

  if (window.lucide) lucide.createIcons();
}

window.askRemoveRoom = (rIdx) => {
  const h = currentHotelsList[activeHotelIdx];
  if (h?.rooms[rIdx]) {
    roomIdxPendingRemove = rIdx;
    document.getElementById('confirm-remove-room-no').innerText = `房號 ${h.rooms[rIdx].roomNo}`;
    document.getElementById('confirm-remove-room-modal').classList.remove('hidden');
  }
};

function openAddExpenseModal() {
  const payerSelect = document.getElementById('exp-payer');
  const taxiContainer = document.getElementById('taxi-members-checkboxes');
  const partnerList = currentTripData?.members ? Object.values(currentTripData.members) : [];

  payerSelect.innerHTML = partnerList.map(p => `
    <option value="${p.id}" ${p.id === currentUser.uid ? 'selected' : ''}>${p.name} ${p.id === currentUser.uid ? '(我)' : ''}</option>
  `).join('');

  taxiContainer.innerHTML = partnerList.map(p => `
    <label class="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl cursor-pointer">
      <input type="checkbox" value="${p.id}" checked class="w-4 h-4 accent-brand-600">
      <span class="text-xs font-semibold text-slate-800 truncate">${p.name}</span>
    </label>
  `).join('');

  document.getElementById('add-expense-modal').classList.remove('hidden');
}

// ==================== 頁面事件監聽與身份驗證 ====================

window.addEventListener('DOMContentLoaded', () => {
  // 核心登入狀態監聽
  subscribeAuthState((user) => {
    if (!user) {
      window.location.href = "login.html";
    } else {
      currentUser.uid = user.uid;
      currentUser.name = user.displayName || user.email.split('@')[0];
      currentUser.avatar = user.photoURL || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120";
      activeUserId = currentUser.uid;

      initRoom();
    }
  });

  // 主分頁切換
  document.getElementById('tab-btn-overview').onclick = () => switchTab('overview');
  document.getElementById('tab-btn-itinerary').onclick = () => switchTab('itinerary');
  document.getElementById('tab-btn-bookkeeping').onclick = () => switchTab('bookkeeping');

  // 身分預視切換
  document.getElementById('preview-user-p1').onclick = () => switchUserPreview('admin');
  document.getElementById('preview-user-p2').onclick = () => switchUserPreview('member');

  // 行程設定 Modal
  document.getElementById('btn-open-trip-settings').onclick = () => document.getElementById('admin-trip-modal').classList.remove('hidden');
  document.getElementById('btn-close-trip-settings').onclick = () => document.getElementById('admin-trip-modal').classList.add('hidden');
  document.getElementById('btn-cancel-trip-settings').onclick = () => document.getElementById('admin-trip-modal').classList.add('hidden');
  document.getElementById('form-trip-settings').onsubmit = handleSaveTripSettings;

  document.getElementById('btn-copy-invite-code').onclick = () => {
    if (currentTripData?.inviteCode) {
      navigator.clipboard.writeText(currentTripData.inviteCode);
      showToast(`已複製邀請碼：${currentTripData.inviteCode}`);
    }
  };

  // 航班 Modal (全員)
  document.querySelector('button:has(i[data-lucide="plane"])').onclick = () => {
    document.getElementById('public-flight-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  };
  document.getElementById('btn-close-public-flight').onclick = () => document.getElementById('public-flight-modal').classList.add('hidden');
  document.getElementById('btn-close-public-flight-footer').onclick = () => document.getElementById('public-flight-modal').classList.add('hidden');

  document.getElementById('flight-tab-out').onclick = () => {
    document.getElementById('flight-tab-out').className = "flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-2xs flex items-center justify-center gap-1.5 transition-all";
    document.getElementById('flight-tab-in').className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-600 flex items-center justify-center gap-1.5 transition-all";
    document.getElementById('flight-card-out').classList.remove('hidden');
    document.getElementById('flight-card-in').classList.add('hidden');
  };
  document.getElementById('flight-tab-in').onclick = () => {
    document.getElementById('flight-tab-in').className = "flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-2xs flex items-center justify-center gap-1.5 transition-all";
    document.getElementById('flight-tab-out').className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-600 flex items-center justify-center gap-1.5 transition-all";
    document.getElementById('flight-card-in').classList.remove('hidden');
    document.getElementById('flight-card-out').classList.add('hidden');
  };

  document.getElementById('btn-egg-out-seat').onclick = () => openSeatEggModal('out');
  document.getElementById('btn-egg-in-seat').onclick = () => openSeatEggModal('in');
  document.getElementById('btn-close-seat-egg').onclick = () => document.getElementById('seat-egg-modal').classList.add('hidden');
  document.getElementById('btn-close-seat-egg-footer').onclick = () => document.getElementById('seat-egg-modal').classList.add('hidden');

  // 航班設定 (管理員)
  document.querySelector('button:has(i[data-lucide="plane-takeoff"])').onclick = openAdminFlightModal;
  document.getElementById('btn-close-admin-flight').onclick = () => document.getElementById('admin-flight-modal').classList.add('hidden');
  document.getElementById('btn-cancel-admin-flight').onclick = () => document.getElementById('admin-flight-modal').classList.add('hidden');
  document.getElementById('form-admin-flight').onsubmit = handleSaveFlightSettings;

  document.getElementById('subtab-admin-out').onclick = () => switchFlightSubTab('out');
  document.getElementById('subtab-admin-in').onclick = () => switchFlightSubTab('in');
  document.getElementById('subtab-admin-seats').onclick = () => switchFlightSubTab('seats');

  document.getElementById('template-select-out').onchange = (e) => applyAirlineTemplate('out', e.target.value);
  document.getElementById('template-select-in').onchange = (e) => applyAirlineTemplate('in', e.target.value);

  // 住宿 Modal (全員)
  document.querySelector('button:has(i[data-lucide="building-2"])').onclick = () => {
    document.getElementById('public-hotel-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  };
  document.getElementById('btn-close-public-hotel').onclick = () => document.getElementById('public-hotel-modal').classList.add('hidden');
  document.getElementById('btn-close-public-hotel-footer').onclick = () => document.getElementById('public-hotel-modal').classList.add('hidden');

  // 住宿設定 (管理員)
  const adminHotelBtn = document.querySelectorAll('#admin-control-section button')[3];
  if (adminHotelBtn) adminHotelBtn.onclick = openAdminHotelModal;
  document.getElementById('btn-close-admin-hotel').onclick = () => document.getElementById('admin-hotel-modal').classList.add('hidden');
  document.getElementById('btn-cancel-admin-hotel').onclick = () => document.getElementById('admin-hotel-modal').classList.add('hidden');

  document.getElementById('admin-hotel-select').onchange = (e) => {
    activeHotelIdx = parseInt(e.target.value, 10);
    renderAdminSingleHotelForm();
  };
  document.getElementById('hotel-subtab-info').onclick = () => {
    activeHotelSubTab = 'info';
    document.getElementById('hotel-subtab-info').className = "flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-2xs transition-all flex items-center justify-center gap-1.5";
    document.getElementById('hotel-subtab-rooms').className = "flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-600 transition-all flex items-center justify-center gap-1.5";
    renderAdminSingleHotelForm();
  };
  document.getElementById('hotel-subtab-rooms').onclick = () => {
    activeHotelSubTab = 'rooms';
    document.getElementById('hotel-subtab-rooms').className = "flex-1 py-1.5 text-xs font-bold rounded-lg bg-white text-slate-900 shadow-2xs transition-all flex items-center justify-center gap-1.5";
    document.getElementById('hotel-subtab-info').className = "flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-600 transition-all flex items-center justify-center gap-1.5";
    renderAdminSingleHotelForm();
  };

  document.getElementById('btn-add-new-hotel').onclick = () => {
    currentHotelsList.push({
      id: `h_${Date.now()}`,
      nameZh: "新住宿飯店",
      nameForeign: "",
      addressZh: "",
      addressForeign: "",
      phone: "",
      refNo: "REF-001",
      gateType: "none",
      gateCode: "",
      checkInDate: currentTripData?.startDate || "2026-04-01",
      checkInTime: "15:00",
      checkOutDate: currentTripData?.endDate || "2026-04-05",
      checkOutTime: "11:00",
      rooms: [
        { id: `r_${Date.now()}`, roomNo: "101", roomType: "標準雙人房", entryType: "code", roomCode: "1234", assignedPartnerIds: [] }
      ]
    });
    activeHotelIdx = currentHotelsList.length - 1;
    renderAdminHotelDropdown();
    renderAdminSingleHotelForm();
    showToast("已新增住宿，請填寫基本資料與房間！");
  };

  document.getElementById('btn-save-all-hotels').onclick = async () => {
    const btn = document.getElementById('btn-save-all-hotels');
    btn.disabled = true;
    btn.innerText = "儲存中...";

    try {
      const h = currentHotelsList[activeHotelIdx];
      if (h && document.getElementById('admin-h-nameZh')) {
        h.nameZh = document.getElementById('admin-h-nameZh').value;
        h.nameForeign = document.getElementById('admin-h-nameForeign').value;
        h.addressZh = document.getElementById('admin-h-addressZh').value;
        h.addressForeign = document.getElementById('admin-h-addressForeign').value;
        h.phone = document.getElementById('admin-h-phone').value;
        h.refNo = document.getElementById('admin-h-refNo').value;
        h.gateType = document.getElementById('admin-h-gateType').value;
        h.gateCode = h.gateType === 'none' ? '' : document.getElementById('admin-h-gateCode').value;
        h.checkInDate = document.getElementById('admin-h-checkinDate').value;
        h.checkInTime = document.getElementById('admin-h-checkinTime').value;
        h.checkOutDate = document.getElementById('admin-h-checkoutDate').value;
        h.checkOutTime = document.getElementById('admin-h-checkoutTime').value;
      }

      if (h && activeHotelSubTab === 'rooms') {
        (h.rooms || []).forEach((r, idx) => {
          const noInput = document.getElementById(`admin-r-no-${idx}`);
          if (noInput) {
            r.roomNo = noInput.value;
            r.roomType = document.getElementById(`admin-r-type-${idx}`).value;
            r.entryType = document.getElementById(`admin-r-entry-${idx}`).value;
            r.roomCode = r.entryType === 'code' ? document.getElementById(`admin-r-code-${idx}`).value : '';
            const partnerSelect = document.getElementById(`admin-r-partners-${idx}`);
            if (partnerSelect) {
              r.assignedPartnerIds = Array.from(partnerSelect.selectedOptions).map(opt => opt.value);
            }
          }
        });
      }

      await saveTripHotels(currentTripId, currentHotelsList);
      renderHotelOverviewList();
      document.getElementById('admin-hotel-modal').classList.add('hidden');
      showToast("住宿與房間設定已儲存！");
    } catch (err) {
      showToast("儲存失敗：" + err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = "儲存住宿設定";
    }
  };

  document.getElementById('btn-cancel-remove-hotel').onclick = () => document.getElementById('confirm-remove-hotel-modal').classList.add('hidden');
  document.getElementById('btn-confirm-remove-hotel-ok').onclick = () => {
    currentHotelsList.splice(activeHotelIdx, 1);
    activeHotelIdx = Math.max(0, currentHotelsList.length - 1);
    document.getElementById('confirm-remove-hotel-modal').classList.add('hidden');
    renderAdminHotelDropdown();
    renderAdminSingleHotelForm();
    showToast("已刪除該住宿");
  };

  document.getElementById('btn-cancel-remove-room').onclick = () => document.getElementById('confirm-remove-room-modal').classList.add('hidden');
  document.getElementById('btn-confirm-remove-room-ok').onclick = () => {
    const h = currentHotelsList[activeHotelIdx];
    if (h && roomIdxPendingRemove !== null) {
      h.rooms.splice(roomIdxPendingRemove, 1);
      roomIdxPendingRemove = null;
      document.getElementById('confirm-remove-room-modal').classList.add('hidden');
      renderAdminSingleHotelForm();
      showToast("已刪除該房間");
    }
  };

  // 記帳次頁籤切換
  document.getElementById('bk-sub-expenses').onclick = () => switchBookkeepingSub('expenses');
  document.getElementById('bk-sub-payments').onclick = () => switchBookkeepingSub('payments');
  document.getElementById('bk-sub-settlement').onclick = () => switchBookkeepingSub('settlement');

  ['all', 'kitty', 'advance', 'taxi'].forEach(type => {
    const btn = document.getElementById(`exp-filter-${type}`);
    if (btn) {
      btn.onclick = () => {
        currentExpFilter = type;
        ['all', 'kitty', 'advance', 'taxi'].forEach(t => {
          const b = document.getElementById(`exp-filter-${t}`);
          if (b) b.className = (t === type)
            ? "px-3 py-1 text-xs font-semibold rounded-lg bg-white text-slate-900 shadow-xs whitespace-nowrap"
            : "px-3 py-1 text-xs font-semibold rounded-lg text-slate-600 whitespace-nowrap";
        });
        renderExpensesList();
      };
    }
  });

  document.getElementById('btn-open-add-expense').onclick = openAddExpenseModal;
  document.getElementById('btn-close-expense-modal').onclick = () => document.getElementById('add-expense-modal').classList.add('hidden');
  document.getElementById('btn-cancel-expense-modal').onclick = () => document.getElementById('add-expense-modal').classList.add('hidden');

  document.getElementById('exp-type').onchange = (e) => {
    const val = e.target.value;
    document.getElementById('box-exp-payer').classList.toggle('hidden', val === 'kitty');
    document.getElementById('box-taxi-members').classList.toggle('hidden', val !== 'taxi');
  };

  document.getElementById('form-add-expense').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "儲存中...";

    try {
      const type = document.getElementById('exp-type').value;
      const amount = Number(document.getElementById('exp-amount').value);
      const title = document.getElementById('exp-title').value;
      
      let payerId = 'kitty';
      let payerName = '公費池';
      let splitMembers = [];

      if (type !== 'kitty') {
        payerId = document.getElementById('exp-payer').value;
        const pObj = currentTripData?.members ? currentTripData.members[payerId] : null;
        payerName = pObj ? pObj.name : '成員';
      }

      if (type === 'taxi') {
        const chks = document.querySelectorAll('#taxi-members-checkboxes input:checked');
        splitMembers = Array.from(chks).map(c => c.value);
      }

      await addExpense(currentTripId, { title, amount, type, payerId, payerName, splitMembers });
      document.getElementById('add-expense-modal').classList.add('hidden');
      document.getElementById('form-add-expense').reset();
      document.getElementById('box-exp-payer').classList.add('hidden');
      document.getElementById('box-taxi-members').classList.add('hidden');

      showToast("支出記錄已儲存！");
      await loadBookkeepingData();
    } catch (err) {
      showToast("儲存支出失敗: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "儲存支出";
    }
  };

  document.getElementById('btn-open-submit-payment').onclick = () => document.getElementById('submit-payment-modal').classList.remove('hidden');
  document.getElementById('btn-close-payment-modal').onclick = () => document.getElementById('submit-payment-modal').classList.add('hidden');
  document.getElementById('btn-cancel-payment-modal').onclick = () => document.getElementById('submit-payment-modal').classList.add('hidden');

  document.getElementById('form-submit-payment').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "送出中...";

    try {
      const amount = Number(document.getElementById('pay-amount').value);
      const code = document.getElementById('pay-code').value;

      await submitPayment(currentTripId, {
        uid: currentUser.uid,
        userName: currentUser.name,
        amount,
        code
      });

      document.getElementById('submit-payment-modal').classList.add('hidden');
      document.getElementById('form-submit-payment').reset();
      showToast("已送出公費繳交憑證，等待管理員核對！");
      await loadBookkeepingData();
    } catch (err) {
      showToast("送出失敗: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "送出審核";
    }
  };
});

function switchBookkeepingSub(tab) {
  currentBkSubTab = tab;
  ['expenses', 'payments', 'settlement'].forEach(s => {
    const btn = document.getElementById(`bk-sub-${s}`);
    const sec = document.getElementById(`bk-section-${s}`);
    if (btn && sec) {
      if (s === tab) {
        btn.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg bg-white text-slate-900 shadow-xs transition-all";
        sec.classList.remove('hidden');
      } else {
        btn.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-600 transition-all";
        sec.classList.add('hidden');
      }
    }
  });
  if (window.lucide) lucide.createIcons();
}

function switchTab(tabName) {
  const tabs = ['overview', 'itinerary', 'bookkeeping'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    if (btn && content) {
      if (t === tabName) {
        btn.className = "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all bg-white text-slate-900 shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap";
        content.classList.remove('hidden');
      } else {
        btn.className = "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all text-slate-600 flex items-center justify-center gap-1.5 whitespace-nowrap";
        content.classList.add('hidden');
      }
    }
  });
}

function switchUserPreview(role) {
  const btnP1 = document.getElementById('preview-user-p1');
  const btnP2 = document.getElementById('preview-user-p2');
  if (role === 'admin') {
    activeUserId = currentUser.uid;
    btnP1.className = "px-2.5 py-1 font-bold rounded-lg transition-all bg-white text-slate-900 shadow-2xs";
    btnP2.className = "px-2.5 py-1 font-semibold rounded-lg transition-all text-slate-600";
    showToast("已切換為：管理員視角");
  } else {
    activeUserId = "guest_member";
    btnP1.className = "px-2.5 py-1 font-semibold rounded-lg transition-all text-slate-600";
    btnP2.className = "px-2.5 py-1 font-bold rounded-lg transition-all bg-white text-slate-900 shadow-2xs";
    showToast("已切換為：一般成員視角");
  }
  renderRoomOverview();
  renderPaymentsList();
}
