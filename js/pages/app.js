// js/pages/app.js
import { db } from "../config/firebase.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

const currentUser = {
  uid: "user_alex_default",
  name: "Alex",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120"
};

const urlParams = new URLSearchParams(window.location.search);
const currentTripId = urlParams.get("tripId");

let currentTripData = null;
let currentFlightData = defaultFlightData;
let currentHotelsList = defaultHotelsData;
let currentExpenses = [];
let currentPayments = [];
let airlineTemplates = [];
let activeUserId = currentUser.uid;

// 記帳狀態
let currentBkSubTab = 'expenses'; // 'expenses', 'payments', 'settlement'
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

async function initRoom() {
  if (!currentTripId) {
    alert("無效的行程房間 ID！");
    window.location.href = "index.html";
    return;
  }

  try {
    airlineTemplates = await getAirlineTemplates();
    currentFlightData = await getTripFlight(currentTripId);
    renderFlightDisplay();

    currentHotelsList = await getTripHotels(currentTripId);
    renderHotelOverviewList();
  } catch (err) {
    console.warn("載入細節失敗：", err);
  }

  // 監聽房間主檔
  const tripDocRef = doc(db, "trips", currentTripId);
  onSnapshot(tripDocRef, async (docSnap) => {
    if (!docSnap.exists()) {
      alert("此行程房間已不存在！");
      window.location.href = "index.html";
      return;
    }
    currentTripData = { id: docSnap.id, ...docSnap.data() };
    renderRoomOverview();
    renderSeatsDisplay();
    renderHotelOverviewList();
    await loadBookkeepingData();
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

  // 頂部公費池概況
  document.getElementById('bk-kitty-remaining').innerText = `NT$ ${settlement.kittyRemaining.toLocaleString()}`;
  document.getElementById('bk-total-kitty').innerText = `NT$ ${settlement.totalKittyPaid.toLocaleString()}`;
  document.getElementById('bk-kitty-spent').innerText = `NT$ ${settlement.kittySpent.toLocaleString()}`;
  document.getElementById('bk-total-advance').innerText = `NT$ ${settlement.totalAdvance.toLocaleString()}`;

  // 個人已繳公費額
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

// 彈出記帳 Modal 輔助填入付款人與分攤選單
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

// ==================== 頁面生命週期與事件綁定 ====================

window.addEventListener('DOMContentLoaded', () => {
  initRoom();

  // 1. 三大主 Tab 切換
  document.getElementById('tab-btn-overview').onclick = () => switchTab('overview');
  document.getElementById('tab-btn-itinerary').onclick = () => switchTab('itinerary');
  document.getElementById('tab-btn-bookkeeping').onclick = () => switchTab('bookkeeping');

  // 2. 身分預視
  document.getElementById('preview-user-p1').onclick = () => switchUserPreview('admin');
  document.getElementById('preview-user-p2').onclick = () => switchUserPreview('member');

  // 3. 記帳次頁籤切換
  document.getElementById('bk-sub-expenses').onclick = () => switchBookkeepingSub('expenses');
  document.getElementById('bk-sub-payments').onclick = () => switchBookkeepingSub('payments');
  document.getElementById('bk-sub-settlement').onclick = () => switchBookkeepingSub('settlement');

  // 記帳篩選按鈕
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

  // 新增支出 Modal 開關與欄位連動
  document.getElementById('btn-open-add-expense').onclick = openAddExpenseModal;
  document.getElementById('btn-close-expense-modal').onclick = () => document.getElementById('add-expense-modal').classList.add('hidden');
  document.getElementById('btn-cancel-expense-modal').onclick = () => document.getElementById('add-expense-modal').classList.add('hidden');

  document.getElementById('exp-type').onchange = (e) => {
    const val = e.target.value;
    document.getElementById('box-exp-payer').classList.toggle('hidden', val === 'kitty');
    document.getElementById('box-taxi-members').classList.toggle('hidden', val !== 'taxi');
  };

  // 提交新增支出
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

  // 提交公費匯款憑證 Modal
  document.getElementById('btn-open-submit-payment').onclick = () => {
    document.getElementById('submit-payment-modal').classList.remove('hidden');
  };
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
    if (t === tabName) {
      btn.className = "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all bg-white text-slate-900 shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap";
      content.classList.remove('hidden');
    } else {
      btn.className = "flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all text-slate-600 flex items-center justify-center gap-1.5 whitespace-nowrap";
      content.classList.add('hidden');
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
