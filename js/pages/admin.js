// js/pages/admin.js
import { onAuthStateChange } from "../api/authApi.js";
import { subscribeCountries, getCountryDetail, saveCountryDetail, removeCountry } from "../api/countryApi.js";
import { subscribeSchema, saveSchema } from "../api/schemaApi.js";
import { getAirlineTemplates, saveAirlineTemplate, deleteAirlineTemplate } from "../api/templateApi.js";
import { CoverManager } from "../components/coverManager.js";

// 身份驗證守門員
onAuthStateChange(user => {
    if (!user) {
        window.location.replace("login.html");
    }
});

// ==================== 全域狀態 ====================
let currentCountries = [];
let activeCountryId = null;
let activeCountryData = null;
let detailRegionGroups = [];
let detailEmbassies = [];
let searchQuery = "";
let currentContinentFilter = "ALL";

// 洲別自訂清單 (可排序、可自訂)
let activeContinentsList = ["亞洲", "歐洲", "美洲", "大洋洲", "非洲", "其他"];

let activeNoticeSchema = [];
let activeEmergencySchema = [];
let isOpeningCountry = false;

// ==================== Toast 提示 ====================
export function showToast(msg) {
    const toast = document.getElementById('toast-message');
    const toastText = document.getElementById('toast-text');
    if (toast && toastText) {
        toastText.innerText = msg;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 2200);
    }
}

// ==================== 封面圖元件實例 ====================
const coverManager = new CoverManager({
    containerId: 'cover-thumbnails-grid',
    previewStripId: 'detail-base-covers-preview-strip',
    dropzoneId: 'cover-dropzone',
    fileInputId: 'cover-file-input',
    onCoverChange: (newCovers) => {
        if (activeCountryData) activeCountryData.coverImages = newCovers;
    },
    onToast: showToast
});

// F5 瀏覽器防呆
window.addEventListener('beforeunload', (e) => {
    if (coverManager.isUploading) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
});

// ==================== 視圖切換與路由控制 ====================
export function switchView(viewName) {
    if (coverManager.isUploading) {
        const leave = confirm("圖片正在上傳中，離開將會終止上傳，確定要離開嗎？");
        if (!leave) return;
        coverManager.abortUpload();
    }

    const views = [
        'country-list', 
        'schema-continents',
        'schema-notice',
        'schema-emergency',
        'country-detail', 
        'country-regions-page',
        'country-covers-page', 
        'country-notice-page', 
        'country-emergency-page', 
        'country-coupons-page', 
        'airlines'
    ];

    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.toggle('hidden', v !== viewName);
    });

    const isCountries = [
        'country-list', 
        'country-detail', 
        'country-regions-page', 
        'country-covers-page', 
        'country-notice-page', 
        'country-emergency-page', 
        'country-coupons-page'
    ].includes(viewName);

    const isContinentsSchema = viewName === 'schema-continents';
    const isNoticeSchema = viewName === 'schema-notice';
    const isEmergencySchema = viewName === 'schema-emergency';
    const isAirlines = viewName === 'airlines';

    // 電腦版側欄樣式切換
    const sideCountries = document.getElementById('sidebar-btn-countries');
    const sideContinents = document.getElementById('sidebar-btn-schema-continents');
    const sideNotice = document.getElementById('sidebar-btn-schema-notice');
    const sideEmergency = document.getElementById('sidebar-btn-schema-emergency');
    const sideAirlines = document.getElementById('sidebar-btn-airlines');

    const deskActiveCls = "w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-bold bg-brand-50 text-brand-600 transition-all cursor-pointer";
    const deskInactiveCls = "w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer";

    if (sideCountries) sideCountries.className = isCountries ? deskActiveCls : deskInactiveCls;
    if (sideContinents) sideContinents.className = isContinentsSchema ? deskActiveCls : deskInactiveCls;
    if (sideNotice) sideNotice.className = isNoticeSchema ? deskActiveCls : deskInactiveCls;
    if (sideEmergency) sideEmergency.className = isEmergencySchema ? deskActiveCls : deskInactiveCls;
    if (sideAirlines) sideAirlines.className = isAirlines ? deskActiveCls : deskInactiveCls;

    // 手機端抽屜樣式切換
    const drawerCountries = document.getElementById('drawer-btn-countries');
    const drawerContinents = document.getElementById('drawer-btn-schema-continents');
    const drawerNotice = document.getElementById('drawer-btn-schema-notice');
    const drawerEmergency = document.getElementById('drawer-btn-schema-emergency');
    const drawerAirlines = document.getElementById('drawer-btn-airlines');

    const mobActiveCls = "w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold bg-brand-50 text-brand-600 transition-all";
    const mobInactiveCls = "w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all";

    if (drawerCountries) drawerCountries.className = isCountries ? mobActiveCls : mobInactiveCls;
    if (drawerContinents) drawerContinents.className = isContinentsSchema ? mobActiveCls : mobInactiveCls;
    if (drawerNotice) drawerNotice.className = isNoticeSchema ? mobActiveCls : mobInactiveCls;
    if (drawerEmergency) drawerEmergency.className = isEmergencySchema ? mobActiveCls : mobInactiveCls;
    if (drawerAirlines) drawerAirlines.className = isAirlines ? mobActiveCls : mobInactiveCls;

    if (isAirlines) {
        loadAirlines();
    }
}
window.switchView = switchView;

// ==================== 洲別管理、排序與 Tab 渲染邏輯 ====================
function renderContinentTabs() {
    const container = document.getElementById('continent-tabs-container');
    if (!container) return;

    const allTabs = ['ALL', ...activeContinentsList];
    container.innerHTML = allTabs.map(cont => {
        const isMatch = currentContinentFilter === cont;
        const label = cont === 'ALL' ? '全部' : cont;
        const cls = isMatch 
            ? "px-4 py-2 rounded-xl text-xs font-bold transition-all bg-brand-500 text-white shadow-xs shrink-0 cursor-pointer" 
            : "px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all shrink-0 cursor-pointer";
        return `<button type="button" onclick="window.setContinentFilter('${cont}')" class="${cls}">${label}</button>`;
    }).join('');
}

function renderContinentSelectOptions() {
    const selects = [
        document.getElementById('create-country-continent'),
        document.getElementById('detail-base-continent')
    ];

    selects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = activeContinentsList.map(c => `<option value="${c}">${c}</option>`).join('');
        if (currentVal && activeContinentsList.includes(currentVal)) {
            sel.value = currentVal;
        }
    });
}

function renderContinentsSortEditor() {
    const list = document.getElementById('continents-sort-list');
    const countEl = document.getElementById('continents-count');
    if (countEl) countEl.innerText = activeContinentsList.length;
    if (!list) return;

    if (activeContinentsList.length === 0) {
        list.innerHTML = `
            <div class="py-12 flex flex-col items-center justify-center text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-xs text-slate-400 mb-2">
                    <i data-lucide="map-pin" class="w-5 h-5"></i>
                </div>
                <p class="text-xs font-bold text-slate-600">尚未建立任何洲別</p>
                <p class="text-[11px] text-slate-400 mt-0.5">請先使用上方輸入框新增洲別名稱</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    list.innerHTML = activeContinentsList.map((item, idx) => `
        <div class="bg-white border border-slate-200/90 rounded-2xl shadow-xs transition-all duration-150 overflow-hidden">
            <div class="px-4 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-brand-500 ring-4 ring-brand-100/80"></span>
                    <span class="text-sm font-bold text-slate-900">${item}</span>
                    <span class="text-[11px] font-medium text-slate-400">順序：第 ${idx + 1} 位</span>
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" onclick="window.moveContinentOrder(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} 
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-20 disabled:hover:bg-transparent transition-all cursor-pointer" title="往上移">
                        <i data-lucide="chevron-up" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                    <button type="button" onclick="window.moveContinentOrder(${idx}, 1)" ${idx === activeContinentsList.length - 1 ? 'disabled' : ''} 
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-20 disabled:hover:bg-transparent transition-all cursor-pointer" title="往下移">
                        <i data-lucide="chevron-down" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                    <div class="w-px h-4 bg-slate-200 mx-1"></div>
                    <button type="button" onclick="window.removeContinentItem(${idx})" 
                        class="h-7 px-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex items-center gap-1 cursor-pointer" title="刪除此洲別">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
                        <span>刪除</span>
                    </button>
                </div>
            </div>
            <div class="p-3.5 sm:p-4">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-slate-500">修改名稱：</span>
                    <input type="text" value="${item}" 
                        onchange="window.updateContinentName(${idx}, this.value)" 
                        class="h-8 px-3 bg-slate-50 focus:bg-white border border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 rounded-xl text-xs font-medium text-slate-800 transition-all focus:outline-none w-48">
                </div>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

window.addNewContinentItem = function() {
    const input = document.getElementById('new-continent-input');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    if (activeContinentsList.includes(val)) {
        showToast("該洲別名稱已存在！");
        return;
    }
    activeContinentsList.push(val);
    input.value = '';
    renderContinentsSortEditor();
};

window.moveContinentOrder = function(idx, direction) {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= activeContinentsList.length) return;
    const temp = activeContinentsList[idx];
    activeContinentsList[idx] = activeContinentsList[targetIdx];
    activeContinentsList[targetIdx] = temp;
    renderContinentsSortEditor();
};

window.updateContinentName = function(idx, val) {
    const trimmed = val.trim();
    if (trimmed && trimmed !== activeContinentsList[idx]) {
        activeContinentsList[idx] = trimmed;
        renderContinentsSortEditor();
    }
};

window.removeContinentItem = function(idx) {
    if (activeContinentsList.length <= 1) {
        showToast("至少需保留一個洲別！");
        return;
    }
    const name = activeContinentsList[idx];
    if (!confirm(`確定刪除「${name}」？若有國家設為此洲別，將自動歸類至未分類。`)) return;
    activeContinentsList.splice(idx, 1);
    renderContinentsSortEditor();
};

window.saveContinentsSchema = async function() {
    try {
        await saveSchema('continents', { list: activeContinentsList });
        renderContinentTabs();
        renderContinentSelectOptions();
        renderCountries();
        showToast("洲別設定已成功儲存至資料庫！");
    } catch (err) {
        showToast("儲存失敗：" + err.message);
    }
};

window.setContinentFilter = function(continent) {
    currentContinentFilter = continent;
    renderContinentTabs();
    renderCountries();
};

// ==================== 國家清單渲染 ====================
function renderCountries() {
    const grid = document.getElementById('countries-grid');
    if (!grid) return;

    const defaultContinent = activeContinentsList[0] || "亞洲";

    // 1. 篩選
    let filtered = currentCountries.filter(c => {
        const countryContinent = c.continent || defaultContinent;
        if (currentContinentFilter !== "ALL" && countryContinent !== currentContinentFilter) {
            return false;
        }

        if (!searchQuery) return true;
        const matchName = c.id.toLowerCase().includes(searchQuery);
        const matchRegions = (c.regions || []).some(r => {
            if (typeof r === 'string') return r.toLowerCase().includes(searchQuery);
            if (r && r.name) {
                const matchParent = r.name.toLowerCase().includes(searchQuery);
                const matchSub = (r.subRegions || []).some(sub => sub.toLowerCase().includes(searchQuery));
                return matchParent || matchSub;
            }
            return false;
        });
        return matchName || matchRegions;
    });

    // 2. 排序：當在全部 (ALL) 時，嚴格依據 activeContinentsList 的自訂順序排列國家
    filtered.sort((a, b) => {
        const contA = a.continent || defaultContinent;
        const contB = b.continent || defaultContinent;
        
        let idxA = activeContinentsList.indexOf(contA);
        let idxB = activeContinentsList.indexOf(contB);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;

        if (idxA !== idxB) {
            return idxA - idxB;
        }
        return a.id.localeCompare(b.id, 'zh-Hant'); // 同洲別時依國名筆劃排序
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-xs text-slate-400">找不到符合條件的國家或地區</div>`;
        return;
    }

    grid.innerHTML = filtered.map(c => {
        const cover = (c.coverImages && c.coverImages.length > 0) 
            ? c.coverImages[0] 
            : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=600';
        const continentTag = c.continent || defaultContinent;

        return `
        <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between">
            <div class="relative h-36 w-full bg-slate-100 overflow-hidden">
                <img src="${cover}" class="w-full h-full object-cover">
                <span class="absolute top-3 left-3 px-2.5 py-1 bg-slate-900/60 backdrop-blur-xs text-white text-[10px] font-bold rounded-lg tracking-wider">
                    ${continentTag}
                </span>
            </div>

            <div class="p-4 flex items-center justify-between">
                <h3 class="font-bold text-base text-slate-900 tracking-tight">${c.id}</h3>
                <div class="flex items-center gap-1 relative z-10">
                    <button type="button" onclick="window.openCountryDetail('${c.id}')" title="編輯" class="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-brand-600 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
                        <i data-lucide="pencil" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                    <button type="button" onclick="window.deleteCountry('${c.id}')" title="刪除" class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer">
                        <i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

window.openCountryDetail = async function(countryId) {
    if (isOpeningCountry) return;
    isOpeningCountry = true;

    try {
        activeCountryId = countryId;
        activeCountryData = await getCountryDetail(countryId);
        if (!activeCountryData) return;

        document.getElementById('detail-country-name').innerText = countryId;
        document.querySelectorAll('.back-to-country-text').forEach(el => {
            el.innerText = `返回 ${countryId} 設定`;
        });

        // 重新同步下拉選單
        renderContinentSelectOptions();
        const continentSelect = document.getElementById('detail-base-continent');
        if (continentSelect) {
            continentSelect.value = activeCountryData.continent || activeContinentsList[0] || '亞洲';
        }

        document.getElementById('detail-base-currency').value = activeCountryData.currency || '';
        document.getElementById('detail-base-timezone').value = activeCountryData.timezone || '';

        coverManager.setCovers(activeCountryData.coverImages || []);

        const rawRegions = activeCountryData.regions || [];
        detailRegionGroups = rawRegions.map(r => {
            if (typeof r === 'string') {
                return { name: r, subRegions: [] };
            }
            return {
                name: r.name || '',
                subRegions: Array.isArray(r.subRegions) ? r.subRegions : []
            };
        });
        renderRegionGroups();

        // 渲染行前須知
        renderDynamicFields('notice', activeNoticeSchema, activeCountryData.notice || {});

        // 區塊一：三大緊急直撥電話回填
        const emg = activeCountryData.emergency || {};
        const policeInput = document.getElementById('detail-emg-police');
        const ambulanceInput = document.getElementById('detail-emg-ambulance');
        const fireInput = document.getElementById('detail-emg-fire');

        if (policeInput) policeInput.value = emg.police || activeCountryData.police || '';
        if (ambulanceInput) ambulanceInput.value = emg.ambulance || activeCountryData.ambulance || '';
        if (fireInput) fireInput.value = emg.fire || activeCountryData.fire || '';

        // 區塊二：駐外使館列表回填
        detailEmbassies = Array.isArray(activeCountryData.embassies) 
            ? JSON.parse(JSON.stringify(activeCountryData.embassies)) 
            : [];
        
        if (detailEmbassies.length === 0 && (emg.embassy || activeCountryData.foreignEmergency)) {
            detailEmbassies.push({
                id: 'emb_' + Date.now(),
                name: '台北駐外經濟文化代表處',
                type: 'main',
                phone: emg.embassy || activeCountryData.foreignEmergency || '',
                emergencyPhone: '',
                address: '',
                jurisdiction: ''
            });
        }
        renderEmbassies();

        // 區塊三：急難救助自訂題目
        renderDynamicFields('emergency', activeEmergencySchema, emg);

        renderCoupons();
        switchView('country-detail');
    } catch (err) {
        showToast("讀取資料失敗：" + err.message);
    } finally {
        isOpeningCountry = false;
    }
};

window.deleteCountry = async function(id) {
    if (confirm(`確定要刪除「${id}」及其所有公版資料嗎？`)) {
        await removeCountry(id);
        showToast("已刪除該國家/地區！");
    }
};

// ==================== 駐外館處管理邏輯 ====================
function renderEmbassies() {
    const container = document.getElementById('embassies-container');
    if (!container) return;

    if (detailEmbassies.length === 0) {
        container.innerHTML = `
            <div class="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                尚未設定駐外館處資訊，點擊上方「新增駐外館處」按鈕建立。
            </div>
        `;
        return;
    }

    container.innerHTML = detailEmbassies.map((emb, idx) => `
        <div class="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5 relative">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded-lg text-[11px] font-bold ${emb.type === 'main' ? 'bg-brand-50 text-brand-700 border border-brand-200/60' : 'bg-slate-100 text-slate-600'}">
                        ${emb.type === 'main' ? '總代表處 / 總領事館' : '分處 / 辦事處'}
                    </span>
                    <span class="text-sm font-bold text-slate-900">${emb.name || '未命名館處'}</span>
                </div>
                <button type="button" onclick="window.removeEmbassy(${idx})" class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer" title="刪除此館處">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="space-y-1">
                    <label class="text-[11px] font-bold text-slate-600 block">館處名稱</label>
                    <input type="text" value="${emb.name || ''}" oninput="window.updateEmbassyField(${idx}, 'name', this.value)" placeholder="例如：台北駐日經濟文化代表處" class="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                </div>

                <div class="space-y-1">
                    <label class="text-[11px] font-bold text-slate-600 block">館處類型</label>
                    <select onchange="window.updateEmbassyField(${idx}, 'type', this.value)" class="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                        <option value="main" ${emb.type === 'main' ? 'selected' : ''}>總代表處 / 總領事館 (主要)</option>
                        <option value="branch" ${emb.type === 'branch' ? 'selected' : ''}>分支辦事處 / 分處</option>
                    </select>
                </div>

                <div class="space-y-1">
                    <label class="text-[11px] font-bold text-slate-600 block">總機電話 / 諮詢電話</label>
                    <input type="tel" value="${emb.phone || ''}" oninput="window.updateEmbassyField(${idx}, 'phone', this.value)" placeholder="例如：+81-3-3280-7811" class="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800">
                </div>

                <div class="space-y-1">
                    <label class="text-[11px] font-bold text-rose-600 block">24H 急難救助專線</label>
                    <input type="tel" value="${emb.emergencyPhone || ''}" oninput="window.updateEmbassyField(${idx}, 'emergencyPhone', this.value)" placeholder="專供車禍、危急求助使用" class="w-full h-10 px-3 bg-rose-50/40 border border-rose-200 rounded-xl font-mono text-xs font-bold text-rose-700 placeholder:text-rose-300">
                </div>

                <div class="space-y-1 sm:col-span-2">
                    <label class="text-[11px] font-bold text-slate-600 block">館處地址</label>
                    <input type="text" value="${emb.address || ''}" oninput="window.updateEmbassyField(${idx}, 'address', this.value)" placeholder="當地語言或英文地址，供導航與計程車使用" class="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800">
                </div>

                <div class="space-y-1 sm:col-span-2">
                    <label class="text-[11px] font-bold text-slate-600 block">轄區涵蓋或備註</label>
                    <input type="text" value="${emb.jurisdiction || ''}" oninput="window.updateEmbassyField(${idx}, 'jurisdiction', this.value)" placeholder="例如：負責關東地區 (東京、神奈川、千葉、埼玉等)" class="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                </div>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

window.addNewEmbassy = function() {
    const isFirst = detailEmbassies.length === 0;
    detailEmbassies.push({
        id: 'emb_' + Date.now(),
        name: isFirst ? '台北駐外經濟文化代表處' : '辦事處',
        type: isFirst ? 'main' : 'branch',
        phone: '',
        emergencyPhone: '',
        address: '',
        jurisdiction: ''
    });
    renderEmbassies();
};

window.removeEmbassy = function(idx) {
    if (!confirm(`確定刪除「${detailEmbassies[idx].name || '此館處'}」？`)) return;
    detailEmbassies.splice(idx, 1);
    renderEmbassies();
};

window.updateEmbassyField = function(idx, key, value) {
    if (detailEmbassies[idx]) {
        detailEmbassies[idx][key] = value;
        if (key === 'name' || key === 'type') {
            const card = document.getElementById('embassies-container').children[idx];
            if (card) {
                const titleSpan = card.querySelector('.text-sm.font-bold');
                if (titleSpan) titleSpan.innerText = value || '未命名館處';
            }
        }
    }
};

// ==================== 儲存國家公版設定 ====================
window.saveCurrentCountryDetail = async function() {
    if (!activeCountryId) return;

    if (coverManager.isUploading) {
        showToast("圖片仍在背景上傳中，請稍候再儲存！");
        return;
    }

    try {
        const parentInput = document.getElementById('regions-parent-input');
        if (parentInput && parentInput.value.trim()) {
            const val = parentInput.value.trim();
            if (!detailRegionGroups.some(g => g.name === val)) {
                detailRegionGroups.push({ name: val, subRegions: [] });
                parentInput.value = '';
            }
        }

        detailRegionGroups.forEach((group, pIdx) => {
            const subInput = document.getElementById(`sub-region-input-${pIdx}`);
            if (subInput && subInput.value.trim()) {
                const subVal = subInput.value.trim();
                if (!group.subRegions.includes(subVal)) {
                    group.subRegions.push(subVal);
                    subInput.value = '';
                }
            }
        });

        renderRegionGroups();

        const dynamicNoticeData = {};
        activeNoticeSchema.forEach(field => {
            const el = document.getElementById(`dynamic-notice-${field.id}`);
            if (el) dynamicNoticeData[field.id] = el.value.trim();
        });

        const dynamicEmergencyData = {};
        activeEmergencySchema.forEach(field => {
            const el = document.getElementById(`dynamic-emergency-${field.id}`);
            if (el) dynamicEmergencyData[field.id] = el.value.trim();
        });

        const policeVal = document.getElementById('detail-emg-police') ? document.getElementById('detail-emg-police').value.trim() : '';
        const ambulanceVal = document.getElementById('detail-emg-ambulance') ? document.getElementById('detail-emg-ambulance').value.trim() : '';
        const fireVal = document.getElementById('detail-emg-fire') ? document.getElementById('detail-emg-fire').value.trim() : '';

        const finalEmergencyData = {
            ...dynamicEmergencyData,
            police: policeVal,
            ambulance: ambulanceVal,
            fire: fireVal
        };

        const defaultContinent = activeContinentsList[0] || '亞洲';
        const updated = {
            continent: document.getElementById('detail-base-continent') ? document.getElementById('detail-base-continent').value : (activeCountryData.continent || defaultContinent),
            currency: document.getElementById('detail-base-currency').value.trim().toUpperCase(),
            timezone: document.getElementById('detail-base-timezone').value.trim(),
            regions: detailRegionGroups,
            coverImages: coverManager.getCovers(),
            notice: dynamicNoticeData,
            emergency: finalEmergencyData,
            embassies: detailEmbassies,
            police: policeVal,
            ambulance: ambulanceVal,
            fire: fireVal
        };

        await saveCountryDetail(activeCountryId, updated);
        showToast(`已儲存「${activeCountryId}」所有資料！`);
    } catch (err) {
        showToast("儲存失敗：" + err.message);
    }
};

// ==================== 兩層級旅遊地區管理邏輯 ====================
function renderRegionGroups() {
    const count = detailRegionGroups.length;
    const countEl = document.getElementById('regions-page-count');
    const mainCountEl = document.getElementById('detail-base-regions-count');
    const container = document.getElementById('regions-groups-container');

    if (countEl) countEl.innerText = count;
    if (mainCountEl) mainCountEl.innerText = `已設定 ${count} 個區域`;

    if (!container) return;

    if (count === 0) {
        container.innerHTML = `
            <div class="py-12 flex flex-col items-center justify-center text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-xs text-slate-400 mb-2">
                    <i data-lucide="map-pin" class="w-5 h-5"></i>
                </div>
                <p class="text-xs font-bold text-slate-600">尚未建立任何區域</p>
                <p class="text-[11px] text-slate-400 mt-0.5">請先使用上方輸入框新增主要區域</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    container.innerHTML = detailRegionGroups.map((group, pIdx) => `
        <div class="bg-white border border-slate-200/90 rounded-2xl shadow-xs transition-all duration-150 overflow-hidden">
            <div class="px-4 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-brand-500 ring-4 ring-brand-100/80"></span>
                    <span class="text-sm font-bold text-slate-900">${group.name}</span>
                    <span class="text-[11px] font-medium text-slate-400">(${group.subRegions.length})</span>
                </div>
                <button type="button" 
                    onclick="window.removeParentRegion(${pIdx})" 
                    class="h-7 px-2.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex items-center gap-1 cursor-pointer">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
                    <span>刪除區域</span>
                </button>
            </div>

            <div class="p-3.5 sm:p-4">
                <div class="flex flex-wrap items-center gap-2">
                    ${group.subRegions.map((sub, sIdx) => `
                        <span class="inline-flex items-center h-8 pl-3 pr-1.5 bg-slate-100/70 hover:bg-slate-100 text-slate-800 text-xs font-medium rounded-xl transition-colors group">
                            <span>${sub}</span>
                            <button type="button" 
                                onclick="window.removeSubRegion(${pIdx}, ${sIdx})" 
                                class="w-6 h-6 ml-1 flex items-center justify-center text-slate-400 hover:text-rose-600 active:scale-90 transition-transform cursor-pointer" 
                                title="刪除">
                                <i data-lucide="x" class="w-3.5 h-3.5 pointer-events-none"></i>
                            </button>
                        </span>
                    `).join('')}

                    <div class="inline-flex items-center h-8 bg-slate-50 hover:bg-white focus-within:bg-white border border-slate-200/90 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10 rounded-xl px-2.5 transition-all shadow-2xs group">
                        <i data-lucide="plus" class="w-3.5 h-3.5 text-slate-400 group-focus-within:text-brand-500 mr-1.5 pointer-events-none transition-colors"></i>
                        <input type="text" 
                            id="sub-region-input-${pIdx}" 
                            placeholder="新增城市" 
                            class="bg-transparent text-xs font-medium text-slate-800 placeholder:text-slate-400 w-24 focus:w-36 focus:outline-none transition-all" 
                            onkeydown="if(event.key==='Enter'){event.preventDefault(); window.addSubRegion(${pIdx});}">
                        <span class="hidden group-focus-within:inline-flex items-center text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200/60 ml-1">↵</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

window.addParentRegion = function() {
    const input = document.getElementById('regions-parent-input');
    const val = input ? input.value.trim() : '';
    if (val && !detailRegionGroups.some(g => g.name === val)) {
        detailRegionGroups.push({ name: val, subRegions: [] });
        renderRegionGroups();
        input.value = '';
    }
};

window.removeParentRegion = function(pIdx) {
    if (!confirm(`確定刪除「${detailRegionGroups[pIdx].name}」及其下所有次級城市嗎？`)) return;
    detailRegionGroups.splice(pIdx, 1);
    renderRegionGroups();
};

window.addSubRegion = function(pIdx) {
    const input = document.getElementById(`sub-region-input-${pIdx}`);
    const val = input ? input.value.trim() : '';
    if (val && !detailRegionGroups[pIdx].subRegions.includes(val)) {
        detailRegionGroups[pIdx].subRegions.push(val);
        renderRegionGroups();
        setTimeout(() => {
            const nextInput = document.getElementById(`sub-region-input-${pIdx}`);
            if (nextInput) nextInput.focus();
        }, 50);
    }
};

window.removeSubRegion = function(pIdx, sIdx) {
    detailRegionGroups[pIdx].subRegions.splice(sIdx, 1);
    renderRegionGroups();
};

// ==================== Schema 題目設定 ====================
function renderSchemaEditor(type, schemaArray) {
    const container = document.getElementById(`schema-${type}-container`);
    if (!container) return;

    container.innerHTML = schemaArray.map((item, idx) => `
        <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-2">
            <span class="w-6 text-center text-xs font-bold text-slate-400 font-mono">${idx + 1}</span>
            <input type="text" value="${item.label}" oninput="window.updateSchemaLabel('${type}', ${idx}, this.value)" placeholder="題目名稱" class="flex-1 h-11 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
            <select onchange="window.updateSchemaType('${type}', ${idx}, this.value)" class="h-11 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600">
                <option value="text" ${item.type === 'text' ? 'selected' : ''}>單行文字</option>
                <option value="textarea" ${item.type === 'textarea' ? 'selected' : ''}>多行長文</option>
                <option value="tel" ${item.type === 'tel' ? 'selected' : ''}>電話格式</option>
            </select>
            <button type="button" onclick="window.removeSchemaItem('${type}', ${idx})" class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-200/60 transition-colors">
                <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
            </button>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

window.updateSchemaLabel = (type, idx, val) => {
    if (type === 'notice') activeNoticeSchema[idx].label = val;
    else activeEmergencySchema[idx].label = val;
};

window.updateSchemaType = (type, idx, val) => {
    if (type === 'notice') activeNoticeSchema[idx].type = val;
    else activeEmergencySchema[idx].type = val;
};

window.addSchemaItem = (type) => {
    const newId = 'field_' + Date.now();
    if (type === 'notice') {
        activeNoticeSchema.push({ id: newId, label: '新增行前題目', type: 'text' });
        renderSchemaEditor('notice', activeNoticeSchema);
    } else {
        activeEmergencySchema.push({ id: newId, label: '新增求助題目', type: 'text' });
        renderSchemaEditor('emergency', activeEmergencySchema);
    }
};

window.removeSchemaItem = (type, idx) => {
    if (type === 'notice') {
        activeNoticeSchema.splice(idx, 1);
        renderSchemaEditor('notice', activeNoticeSchema);
    } else {
        activeEmergencySchema.splice(idx, 1);
        renderSchemaEditor('emergency', activeEmergencySchema);
    }
};

window.saveNoticeSchema = async () => {
    try {
        await saveSchema('notice', activeNoticeSchema);
        showToast("行前資訊設定已儲存！");
    } catch (err) {
        showToast("儲存失敗：" + err.message);
    }
};

window.saveEmergencySchema = async () => {
    try {
        await saveSchema('emergency', activeEmergencySchema);
        showToast("急難救助設定已儲存！");
    } catch (err) {
        showToast("儲存失敗：" + err.message);
    }
};

function renderDynamicFields(type, schemaArray, dataObject) {
    const container = document.getElementById(`${type}-dynamic-fields-container`);
    if (!container) return;

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${schemaArray.map(field => {
                const val = dataObject[field.id] || '';
                const isFull = field.type === 'textarea';
                return `
                    <div class="space-y-1.5 ${isFull ? 'md:col-span-2' : ''}">
                        <label class="text-sm font-bold text-slate-800 block">${field.label}</label>
                        ${field.type === 'textarea' ? `
                            <textarea id="dynamic-${type}-${field.id}" rows="3" class="w-full p-3 bg-slate-50/50 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:bg-white">${val}</textarea>
                        ` : `
                            <input type="${field.type || 'text'}" id="dynamic-${type}-${field.id}" value="${val}" class="w-full h-11 px-3.5 bg-slate-50/50 border border-slate-200/80 rounded-xl ${field.type === 'tel' ? 'font-mono font-bold text-slate-700' : ''} text-xs focus:outline-none focus:bg-white">
                        `}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ==================== 優惠券管理 ====================
function renderCoupons() {
    const coupons = (activeCountryData && activeCountryData.coupons) ? activeCountryData.coupons : [];
    const grid = document.getElementById('coupons-grid');
    if (!grid) return;

    if (coupons.length === 0) {
        grid.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-400">目前尚無優惠券，可點選上方「新增優惠券」按鈕。</div>`;
        return;
    }

    grid.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${coupons.map((cp, idx) => `
            <div class="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
                <div class="space-y-0.5 flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-slate-900 truncate">${cp.store}</span>
                        ${cp.code ? `<span class="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-600 rounded">${cp.code}</span>` : ''}
                    </div>
                    <div class="text-xs font-bold text-amber-600">${cp.discount}</div>
                    ${cp.expiry ? `<div class="text-[11px] text-slate-400">有效期限：${cp.expiry}</div>` : ''}
                    ${cp.link ? `<a href="${cp.link}" target="_blank" class="text-[11px] text-brand-600 hover:underline inline-block mt-0.5 truncate max-w-xs">條碼或兌換連結 ↗</a>` : ''}
                </div>
                <button onclick="window.removeCoupon(${idx})" class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl shrink-0 transition-colors">
                    <i data-lucide="trash" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>
        `).join('')}
    </div>`;

    if (window.lucide) lucide.createIcons();
}

window.openAddCouponModal = () => {
    document.getElementById('form-coupon').reset();
    document.getElementById('modal-coupon').classList.remove('hidden');
};

window.removeCoupon = async (index) => {
    if (!confirm("確定刪除此優惠券？")) return;
    const coupons = (activeCountryData && activeCountryData.coupons) ? activeCountryData.coupons : [];
    coupons.splice(index, 1);
    activeCountryData.coupons = coupons;
    await saveCountryDetail(activeCountryId, { coupons });
    renderCoupons();
    showToast("已刪除優惠券！");
};

// ==================== 航空公司行李庫模組 ====================
async function loadAirlines() {
    try {
        const airlines = await getAirlineTemplates();
        renderAirlines(airlines);
    } catch (err) {
        showToast("載入航空公司失敗：" + err.message);
    }
}

function renderAirlines(airlines) {
    const grid = document.getElementById('airlines-grid');
    if (!grid) return;

    if (!airlines || airlines.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-xs text-slate-400 bg-white rounded-3xl border border-slate-200/80">目前無航司行李資料，點擊右上角新增。</div>`;
        return;
    }

    grid.innerHTML = airlines.map(al => `
        <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                    <h3 class="font-bold text-sm text-slate-900">${al.name}</h3>
                    <span class="text-xs font-mono font-bold text-brand-600">${al.id}</span>
                </div>
                <button onclick="window.removeAirline('${al.id}')" class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </div>
            <div class="space-y-1.5 text-xs text-slate-600">
                <div><span class="font-bold text-slate-800">托運行李：</span>${al.checkedQuota || '無'} (${al.checkedDim || '無限制'})</div>
                <div><span class="font-bold text-slate-800">手提行李：</span>${al.carryQuota || '無'} (${al.carryDim || '無限制'})</div>
                <div><span class="font-bold text-slate-800">隨身包：</span>${al.personalQuota || '無'}</div>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

window.removeAirline = async (code) => {
    if (!confirm(`確定要刪除航司「${code}」的行李規範嗎？`)) return;
    try {
        await deleteAirlineTemplate(code);
        showToast("已刪除航司！");
        await loadAirlines();
    } catch (err) {
        showToast("刪除失敗：" + err.message);
    }
};

// ==================== 初始化綁定 ====================
window.addEventListener('DOMContentLoaded', () => {
    subscribeCountries(countries => {
        currentCountries = countries;
        renderCountries();
        if (activeCountryId) {
            const found = currentCountries.find(x => x.id === activeCountryId);
            if (found) activeCountryData = found;
        }
    }, err => showToast("即時監聽失敗：" + err.message));

    // 監聽洲別 Schema 並即時同步排序清單、Tab 與所有下拉選單
    subscribeSchema('continents', schema => {
        if (schema && Array.isArray(schema.list) && schema.list.length > 0) {
            activeContinentsList = schema.list;
        }
        renderContinentTabs();
        renderContinentSelectOptions();
        renderContinentsSortEditor();
        renderCountries();
    });

    subscribeSchema('notice', schema => {
        activeNoticeSchema = schema;
        renderSchemaEditor('notice', activeNoticeSchema);
        if (activeCountryData) renderDynamicFields('notice', activeNoticeSchema, activeCountryData.notice || {});
    });

    subscribeSchema('emergency', schema => {
        activeEmergencySchema = schema;
        renderSchemaEditor('emergency', activeEmergencySchema);
        if (activeCountryData) renderDynamicFields('emergency', activeEmergencySchema, activeCountryData.emergency || {});
    });

    const searchInput = document.getElementById('country-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderCountries();
        });
    }

    // 抽屜選單開關
    const drawer = document.getElementById('drawer-menu');
    const backdrop = document.getElementById('drawer-backdrop');
    const openDrawer = () => {
        backdrop.classList.remove('hidden');
        setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
        drawer.classList.remove('translate-x-full');
        document.body.style.overflow = 'hidden';
    };
    window.closeDrawer = () => {
        backdrop.classList.add('opacity-0');
        drawer.classList.add('translate-x-full');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
        document.body.style.overflow = '';
    };
    document.getElementById('btn-hamburger')?.addEventListener('click', openDrawer);
    document.getElementById('btn-close-drawer')?.addEventListener('click', window.closeDrawer);
    backdrop?.addEventListener('click', window.closeDrawer);

    // 新增國家彈窗
    document.getElementById('btn-add-country-modal')?.addEventListener('click', () => {
        document.getElementById('form-country-create').reset();
        renderContinentSelectOptions();
        document.getElementById('modal-country').classList.remove('hidden');
    });
    document.getElementById('btn-close-country-modal')?.addEventListener('click', () => document.getElementById('modal-country').classList.add('hidden'));
    document.getElementById('btn-cancel-country-modal')?.addEventListener('click', () => document.getElementById('modal-country').classList.add('hidden'));

    document.getElementById('form-country-create')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('create-country-name').value.trim();
        const continent = document.getElementById('create-country-continent').value || activeContinentsList[0] || '亞洲';
        const initData = {
            continent: continent,
            currency: "", 
            timezone: "", 
            regions: [], 
            coverImages: [], 
            notice: {}, 
            emergency: {},
            embassies: [],
            police: "",
            ambulance: "",
            fire: ""
        };
        await saveCountryDetail(name, initData);
        document.getElementById('modal-country').classList.add('hidden');
        showToast("國家已建立！進入設定");
        window.openCountryDetail(name);
    });

    // 優惠券彈窗
    document.getElementById('btn-close-coupon-modal')?.addEventListener('click', () => document.getElementById('modal-coupon').classList.add('hidden'));
    document.getElementById('btn-cancel-coupon')?.addEventListener('click', () => document.getElementById('modal-coupon').classList.add('hidden'));
    document.getElementById('form-coupon')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const coupons = (activeCountryData && activeCountryData.coupons) ? activeCountryData.coupons : [];
        const newCoupon = {
            store: document.getElementById('coupon-store').value.trim(),
            discount: document.getElementById('coupon-discount').value.trim(),
            code: document.getElementById('coupon-code').value.trim(),
            expiry: document.getElementById('coupon-expiry').value.trim(),
            link: document.getElementById('coupon-link').value.trim(),
            notes: document.getElementById('coupon-notes').value.trim()
        };
        coupons.push(newCoupon);
        activeCountryData.coupons = coupons;
        await saveCountryDetail(activeCountryId, { coupons });
        document.getElementById('modal-coupon').classList.add('hidden');
        renderCoupons();
        showToast("成功儲存優惠券！");
    });

    // 新增主要區域綁定
    document.getElementById('regions-parent-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            window.addParentRegion();
        }
    });
    document.getElementById('btn-add-parent-region')?.addEventListener('click', window.addParentRegion);

    // 新增航司規範
    document.getElementById('btn-add-airline')?.addEventListener('click', async () => {
        const code = prompt("請輸入航空公司 2 碼代號 (例如：BR, JX)：");
        if (!code) return;
        const name = prompt("請輸入航空公司全名 (例如：長榮航空)：");
        if (!name) return;
        
        await saveAirlineTemplate(code, {
            name: `${name} (${code.toUpperCase()})`,
            checkedQuota: "2 件 (每件 23 kg)",
            checkedDim: "三邊總和 ≤ 158 cm",
            carryQuota: "1 件 (7 kg)",
            carryDim: "55 x 40 x 23 cm",
            personalQuota: "1 件 (隨身包/筆電包)"
        });
        showToast(`已建立 ${name} 行李公版！`);
        await loadAirlines();
    });

    if (window.lucide) lucide.createIcons();
});
