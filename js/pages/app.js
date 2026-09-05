// js/pages/app.js
import { db } from "../config/firebase.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getTripFlight, saveTripFlight, defaultFlightData } from "../api/flightApi.js";
import { getAirlineTemplates } from "../api/templateApi.js";

// 預設模擬使用者
const currentUser = {
  uid: "user_alex_default",
  name: "Alex",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120"
};

const urlParams = new URLSearchParams(window.location.search);
const currentTripId = urlParams.get("tripId");

let currentTripData = null;
let currentFlightData = defaultFlightData;
let airlineTemplates = [];
let activeUserId = currentUser.uid;

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

// 根據起降時間推算飛行時間
function calculateDuration(dep, arr) {
  if (!dep || !arr) return "3h 00m";
  const [sH, sM] = dep.split(':').map(Number);
  const [eH, eM] = arr.split(':').map(Number);
  let startM = sH * 60 + sM;
  let endM = eH * 60 + eM;
  if (endM < startM) endM += 24 * 60; // 跨日航班
  const diff = endM - startM;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m < 10 ? '0' : ''}${m}m`;
}

// 初始化房間資料與監聽
async function initRoom() {
  if (!currentTripId) {
    alert("無效的行程房間 ID！");
    window.location.href = "index.html";
    return;
  }

  // 1. 預載公版航空公司規範
  try {
    airlineTemplates = await getAirlineTemplates();
  } catch (e) {
    console.warn("載入公版失敗：", e);
  }

  // 2. 載入航班細節
  currentFlightData = await getTripFlight(currentTripId);
  renderFlightDisplay();

  // 3. 監聽房間主文件
  const tripDocRef = doc(db, "trips", currentTripId);
  onSnapshot(tripDocRef, (docSnap) => {
    if (!docSnap.exists()) {
      alert("此行程房間已不存在！");
      window.location.href = "index.html";
      return;
    }
    currentTripData = { id: docSnap.id, ...docSnap.data() };
    renderRoomOverview();
    renderSeatsDisplay();
  }, (err) => {
    showToast("監聽失敗: " + err.message);
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

  // 設定 Modal 欄位綁定
  document.getElementById('admin-trip-title').value = title;
  document.getElementById('admin-trip-country').value = country;
  document.getElementById('admin-trip-startdate').value = startDate;
  document.getElementById('admin-trip-enddate').value = endDate;
  document.getElementById('admin-trip-cover').value = coverImage;
  document.getElementById('admin-invite-code-val').innerText = inviteCode || '------';

  if (window.lucide) lucide.createIcons();
}

// 渲染全員航班檢視卡片
function renderFlightDisplay() {
  const { outbound, inbound } = currentFlightData;

  // 去程卡片
  document.getElementById('display-flight-out-airline').innerText = outbound.airline;
  document.getElementById('display-flight-out-no').innerText = outbound.flightNo;
  document.getElementById('display-flight-out-pnr').innerText = outbound.pnr || 'CI88219';
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

  // 去程行李
  document.getElementById('display-bag-out-checked-quota').innerText = outbound.baggage?.checkedQuota || '2 件 (每件 23 kg)';
  document.getElementById('display-bag-out-checked-dim').innerText = `尺寸限制：${outbound.baggage?.checkedDim || '三邊總和 ≤ 158 cm'}`;
  document.getElementById('display-bag-out-carry-quota').innerText = outbound.baggage?.carryQuota || '1 件 (7 kg)';
  document.getElementById('display-bag-out-carry-dim').innerText = `尺寸限制：${outbound.baggage?.carryDim || '55 x 40 x 23 cm'}`;
  document.getElementById('display-bag-out-personal-quota').innerText = outbound.baggage?.personalQuota || '1 件 (隨身包)';
  document.getElementById('display-bag-out-personal-dim').innerText = `尺寸限制：${outbound.baggage?.personalDim || '40 x 30 x 10 cm'}`;

  // 回程卡片
  document.getElementById('display-flight-in-airline').innerText = inbound.airline;
  document.getElementById('display-flight-in-no').innerText = inbound.flightNo;
  document.getElementById('display-flight-in-pnr').innerText = inbound.pnr || 'CI88219';
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

  // 回程行李
  document.getElementById('display-bag-in-checked-quota').innerText = inbound.baggage?.checkedQuota || '2 件 (每件 23 kg)';
  document.getElementById('display-bag-in-checked-dim').innerText = `尺寸限制：${inbound.baggage?.checkedDim || '三邊總和 ≤ 158 cm'}`;
  document.getElementById('display-bag-in-carry-quota').innerText = inbound.baggage?.carryQuota || '1 件 (7 kg)';
  document.getElementById('display-bag-in-carry-dim').innerText = `尺寸限制：${inbound.baggage?.carryDim || '55 x 40 x 23 cm'}`;
  document.getElementById('display-bag-in-personal-quota').innerText = inbound.baggage?.personalQuota || '1 件 (隨身包)';
  document.getElementById('display-bag-in-personal-dim').innerText = `尺寸限制：${inbound.baggage?.personalDim || '40 x 30 x 10 cm'}`;

  if (window.lucide) lucide.createIcons();
}

// 渲染當前使用者的個人座位
function renderSeatsDisplay() {
  if (!currentTripData || !currentTripData.members) return;
  const mySelf = currentTripData.members[activeUserId] || currentTripData.members[currentUser.uid];
  document.getElementById('display-my-out-seat').innerText = mySelf?.seatOut || '未指定';
  document.getElementById('display-my-in-seat').innerText = mySelf?.seatIn || '未指定';
}

// 開啟夥伴座位彩蛋 Modal
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

// 管理員開啟航班設定 Modal：回填表單數據
function openAdminFlightModal() {
  const { outbound, inbound } = currentFlightData;

  // 去程表單填值
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

  // 回程表單填值
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

  // 渲染夥伴座位輸入框
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

// 快速套用公版規範
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

// 儲存航班與座位設定
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

    // 1. 更新航班子集合
    await saveTripFlight(currentTripId, updatedFlight);
    currentFlightData = updatedFlight;
    renderFlightDisplay();

    // 2. 更新房間成員座位
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

// 事件綁定
window.addEventListener('DOMContentLoaded', () => {
  initRoom();

  // Tab 切換
  document.getElementById('tab-btn-overview').onclick = () => switchTab('overview');
  document.getElementById('tab-btn-itinerary').onclick = () => switchTab('itinerary');
  document.getElementById('tab-btn-bookkeeping').onclick = () => switchTab('bookkeeping');

  // 身分切換預視
  document.getElementById('preview-user-p1').onclick = () => switchUserPreview('admin');
  document.getElementById('preview-user-p2').onclick = () => switchUserPreview('member');

  // 全員開啟航班 Modal
  document.querySelector('button:has(i[data-lucide="plane"])').onclick = () => {
    document.getElementById('public-flight-modal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  };
  document.getElementById('btn-close-public-flight').onclick = () => document.getElementById('public-flight-modal').classList.add('hidden');
  document.getElementById('btn-close-public-flight-footer').onclick = () => document.getElementById('public-flight-modal').classList.add('hidden');

  // 去回程航班切換
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

  // 座位彩蛋
  document.getElementById('btn-egg-out-seat').onclick = () => openSeatEggModal('out');
  document.getElementById('btn-egg-in-seat').onclick = () => openSeatEggModal('in');
  document.getElementById('btn-close-seat-egg').onclick = () => document.getElementById('seat-egg-modal').classList.add('hidden');
  document.getElementById('btn-close-seat-egg-footer').onclick = () => document.getElementById('seat-egg-modal').classList.add('hidden');

  // 管理員開啟航班設定
  document.querySelector('button:has(i[data-lucide="plane-takeoff"])').onclick = openAdminFlightModal;
  document.getElementById('btn-close-admin-flight').onclick = () => document.getElementById('admin-flight-modal').classList.add('hidden');
  document.getElementById('btn-cancel-admin-flight').onclick = () => document.getElementById('admin-flight-modal').classList.add('hidden');
  document.getElementById('form-admin-flight').onsubmit = handleSaveFlightSettings;

  // 航班設定內部 subtab 切換
  document.getElementById('subtab-admin-out').onclick = () => switchFlightSubTab('out');
  document.getElementById('subtab-admin-in').onclick = () => switchFlightSubTab('in');
  document.getElementById('subtab-admin-seats').onclick = () => switchFlightSubTab('seats');

  // 公版下拉選擇
  document.getElementById('template-select-out').onchange = (e) => applyAirlineTemplate('out', e.target.value);
  document.getElementById('template-select-in').onchange = (e) => applyAirlineTemplate('in', e.target.value);
});

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
  renderSeatsDisplay();
}
