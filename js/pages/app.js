// js/pages/app.js
import { db } from "../config/firebase.js";
import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 目前模擬登入的使用者 (後續串接 Firebase Auth 自動替換)
const currentUser = {
  uid: "user_alex_default",
  name: "Alex",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120"
};

// 取得 URL Query 中的 tripId
const urlParams = new URLSearchParams(window.location.search);
const currentTripId = urlParams.get("tripId");

let currentTripData = null;
let activeUserId = currentUser.uid;

// 提示小黑條
export function showToast(msg) {
  const toast = document.getElementById('toast-message');
  const toastText = document.getElementById('toast-text');
  if (toast && toastText) {
    toastText.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2200);
  }
}

// 格式化日期
function formatSlashDate(dStr) {
  return dStr ? dStr.replace(/-/g, '/') : '';
}

// 計算天數與夜數
function calculateDaysAndNights(startStr, endStr) {
  if (!startStr || !endStr) return "1 天 0 夜";
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "1 天 0 夜";
  const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
  const nights = diffDays > 1 ? diffDays - 1 : 0;
  return `${diffDays} 天 ${nights} 夜`;
}

// 即時監聽與載入房間資料
function initRoom() {
  if (!currentTripId) {
    alert("無效的行程房間 ID，點擊返回首頁！");
    window.location.href = "index.html";
    return;
  }

  const tripDocRef = doc(db, "trips", currentTripId);

  // Firestore 即時監聽：任何旅伴修改資料，全體手機畫面零時差同步
  onSnapshot(tripDocRef, (docSnap) => {
    if (!docSnap.exists()) {
      alert("此行程房間已不存在！");
      window.location.href = "index.html";
      return;
    }

    currentTripData = { id: docSnap.id, ...docSnap.data() };
    renderRoomOverview();
  }, (err) => {
    showToast("監聽房間失敗: " + err.message);
  });
}

// 渲染房間首頁基本資訊
function renderRoomOverview() {
  if (!currentTripData) return;

  const { title, country, startDate, endDate, coverImage, members, inviteCode } = currentTripData;
  const daysNightsStr = calculateDaysAndNights(startDate, endDate);
  const formattedDates = `${formatSlashDate(startDate)} ~ ${formatSlashDate(endDate)}`;

  // 1. 封面卡片資訊
  document.getElementById('overview-title').innerText = title;
  document.getElementById('overview-country-tag').innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 text-brand-600"></i>${country}`;
  document.getElementById('overview-days-tag').innerText = daysNightsStr;
  document.getElementById('overview-dates').innerText = formattedDates;
  document.getElementById('overview-cover-img').src = coverImage;

  // 2. 成員名單
  const partnerList = members ? Object.values(members) : [];
  document.getElementById('partner-count-display').innerText = partnerList.length;

  const partnerContainer = document.getElementById('partner-list-container');
  partnerContainer.innerHTML = partnerList.map(p => `
    <div class="flex items-center gap-2.5 p-2 bg-slate-50 rounded-xl">
      <img src="${p.avatar}" class="w-7 h-7 rounded-full object-cover shrink-0">
      <div class="min-w-0">
        <div class="text-xs font-bold text-slate-800 truncate">
          ${p.name}${p.id === currentUser.uid ? ' <span class="text-slate-400 font-normal">(我)</span>' : ''}
        </div>
        <div class="text-[10px] ${p.role === 'admin' ? 'text-brand-600 font-bold' : 'text-slate-400'}">
          ${p.role === 'admin' ? '👑 管理員' : '夥伴'}
        </div>
      </div>
    </div>
  `).join('');

  // 3. 管理員權限區塊切換
  const myRole = members && members[activeUserId] ? members[activeUserId].role : 'member';
  const adminSection = document.getElementById('admin-control-section');
  if (myRole === 'admin') {
    adminSection.classList.remove('hidden');
  } else {
    adminSection.classList.add('hidden');
  }

  // 4. 行程設定 Modal 中的預設值同步
  document.getElementById('admin-trip-title').value = title;
  document.getElementById('admin-trip-country').value = country;
  document.getElementById('admin-trip-startdate').value = startDate;
  document.getElementById('admin-trip-enddate').value = endDate;
  document.getElementById('admin-trip-cover').value = coverImage;
  document.getElementById('admin-invite-code-val').innerText = inviteCode || '------';

  if (window.lucide) lucide.createIcons();
}

// 儲存行程基本設定
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

// 分頁切換
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

// 身分切換預視
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
}

// DOM 事件掛載
window.addEventListener('DOMContentLoaded', () => {
  initRoom();

  // Tab 切換事件
  document.getElementById('tab-btn-overview').onclick = () => switchTab('overview');
  document.getElementById('tab-btn-itinerary').onclick = () => switchTab('itinerary');
  document.getElementById('tab-btn-bookkeeping').onclick = () => switchTab('bookkeeping');

  // 身分預視切換
  document.getElementById('preview-user-p1').onclick = () => switchUserPreview('admin');
  document.getElementById('preview-user-p2').onclick = () => switchUserPreview('member');

  // 行程設定 Modal 開關與表單
  document.getElementById('btn-open-trip-settings').onclick = () => {
    document.getElementById('admin-trip-modal').classList.remove('hidden');
  };
  document.getElementById('btn-close-trip-settings').onclick = () => {
    document.getElementById('admin-trip-modal').classList.add('hidden');
  };
  document.getElementById('btn-cancel-trip-settings').onclick = () => {
    document.getElementById('admin-trip-modal').classList.add('hidden');
  };
  document.getElementById('form-trip-settings').onsubmit = handleSaveTripSettings;

  // 複製邀請碼
  document.getElementById('btn-copy-invite-code').onclick = () => {
    if (currentTripData?.inviteCode) {
      navigator.clipboard.writeText(currentTripData.inviteCode);
      showToast(`已複製邀請碼：${currentTripData.inviteCode}`);
    }
  };
});
