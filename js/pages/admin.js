// js/pages/admin.js

// 1. 所有 import 統一放在最頂部
import { onAuthStateChange } from "../api/authApi.js";
import { subscribeCountries, getCountryDetail, saveCountryDetail, removeCountry } from "../api/countryApi.js";
import { subscribeSchema, saveSchema } from "../api/schemaApi.js";
import { CoverManager } from "../components/coverManager.js";

// 2. 身份驗證守門員 (未登入強制導向，僅需執行一次)
onAuthStateChange(user => {
    if (!user) {
        window.location.replace("login.html");
    }
});

// ==================== 全域狀態 ====================
let currentCountries = [];
let activeCountryId = null;
let activeCountryData = null;
let detailRegionGroups = []; // 兩層級地區：[{ name: "北海道", subRegions: ["札幌", "函館"] }]
let searchQuery = "";

let activeNoticeSchema = [];
let activeEmergencySchema = [];
let isOpeningCountry = false; // 防止重複觸控

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

// F5 防呆
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

    const isCountries = viewName === 'country-list';
    const isNoticeSchema = viewName === 'schema-notice';
    const isEmergencySchema = viewName === 'schema-emergency';
    const isAirlines = viewName === 'airlines';

    const sideCountries = document.getElementById('sidebar-btn-countries');
    const sideNotice = document.getElementById('sidebar-btn-schema-notice');
    const sideEmergency = document.getElementById('sidebar-btn-schema-emergency');
    const sideAirlines = document.getElementById('sidebar-btn-airlines');

    const activeCls = "w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-bold bg-brand-50 text-brand-600 transition-all cursor-pointer";
    const inactiveCls = "w-full h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer";

    if (sideCountries) sideCountries.className = isCountries ? activeCls : inactiveCls;
    if (sideNotice) sideNotice.className = isNoticeSchema ? activeCls : inactiveCls;
    if (sideEmergency) sideEmergency.className = isEmergencySchema ? activeCls : inactiveCls;
    if (sideAirlines) sideAirlines.className = isAirlines ? activeCls : inactiveCls;
}
window.switchView = switchView;

// ==================== 國家清單渲染 (修復觸控延遲與陰影卡死) ====================
function renderCountries() {
    const grid = document.getElementById('countries-grid');
    if (!grid) return;

    const filtered = currentCountries.filter(c => {
        if (!searchQuery) return true;
        const matchName = c.id.toLowerCase().includes(searchQuery);
        // 支援新舊格式的搜尋檢索
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

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-16 text-center text-xs text-slate-400">找不到符合條件的國家或地區</div>`;
        return;
    }

    grid.innerHTML = filtered.map(c => {
        const cover = (c.coverImages && c.coverImages.length > 0) 
            ? c.coverImages[0] 
            : 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=600';
        return `
        <div class="bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between">
            <div class="relative h-36 w-full bg-slate-100 overflow-hidden">
                <img src="${cover}" class="w-full h-full object-cover">
            </div>

            <div class="p-4 flex items-center justify-between">
                <h3 class="font-bold text-base text-slate-900 tracking-tight">${c.id}</h3>
                <div class="flex items-center gap-1.5 relative z-10">
                    <button type="button" onclick="window.openCountryDetail('${c.id}')" title="編輯" class="w-11 h-11 flex items-center justify-center text-slate-500 hover:text-brand-600 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors touch-manipulation cursor-pointer">
                        <i data-lucide="pencil" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                    <button type="button" onclick="window.deleteCountry('${c.id}')" title="刪除" class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors touch-manipulation cursor-pointer">
                        <i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// 點擊編輯國家 (加入防止連點鎖定)
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

        document.getElementById('detail-base-currency').value = activeCountryData.currency || '';
        document.getElementById('detail-base-timezone').value = activeCountryData.timezone || '';

        coverManager.setCovers(activeCountryData.coverImages || []);

        // 轉換新舊格式為標準雙層級資料結構
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

        renderDynamicFields('notice', activeNoticeSchema, activeCountryData.notice || {});
        renderDynamicFields('emergency', activeEmergencySchema, activeCountryData.emergency || {});

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

window.saveCurrentCountryDetail = async function() {
    if (!activeCountryId) return;

    if (coverManager.isUploading) {
        showToast("圖片仍在背景上傳中，請稍候再儲存！");
        return;
    }

    try {
        // 自動吸收未完成的地區輸入
        const parentInput = document.getElementById('regions-parent-input');
        if (parentInput && parentInput.value.trim()) {
            window.addParentRegion();
        }

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

        const updated = {
            currency: document.getElementById('detail-base-currency').value.trim().toUpperCase(),
            timezone: document.getElementById('detail-base-timezone').value.trim(),
            regions: detailRegionGroups, // 儲存二層級結構
            coverImages: coverManager.getCovers(),
            notice: dynamicNoticeData,
            emergency: dynamicEmergencyData
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
        container.innerHTML = `<div class="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">目前尚無區域，請使用上方輸入框新增主要區域。</div>`;
        return;
    }

    container.innerHTML = detailRegionGroups.map((group, pIdx) => `
        <div class="p-4 sm:p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full bg-brand-500"></span>
                    <span class="text-base font-bold text-slate-900">${group.name}</span>
                    <span class="text-xs text-slate-400 font-mono">(${group.subRegions.length} 個城市)</span>
                </div>
                <button type="button" onclick="window.removeParentRegion(${pIdx})" class="text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors p-1">
                    刪除整個區域
                </button>
            </div>

            <!-- 次級城市標籤列 -->
            <div class="flex flex-wrap items-center gap-2 pt-1">
                ${group.subRegions.map((sub, sIdx) => `
                    <span class="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl shadow-2xs">
                        <span>${sub}</span>
                        <button type="button" onclick="window.removeSubRegion(${pIdx}, ${sIdx})" class="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-rose-600">
                            <i data-lucide="x" class="w-3 h-3"></i>
                        </button>
                    </span>
                `).join('')}

                <!-- 新增次級城市快速輸入框 -->
                <div class="inline-flex items-center">
                    <input type="text" id="sub-region-input-${pIdx}" placeholder="+ 新增次級 (按 Enter)" class="h-8 px-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-medium text-slate-700 w-36 focus:w-44 transition-all" onkeydown="if(event.key==='Enter'){event.preventDefault(); window.addSubRegion(${pIdx});}">
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
        // 自動聚焦回輸入框以利連續輸入
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

// ==================== Schema 題目設定與動態欄位 ====================
function renderSchemaEditor(type, schemaArray) {
    const container = document.getElementById(`schema-${type}-container`);
    if (!container) return;

    container.innerHTML = schemaArray.map((item, idx) => `
        <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-2">
            <span class="w-6 text-center text-xs font-bold text-slate-400 font-mono">${idx + 1}</span>
            <input type="text" value="${item.label}" oninput="window.updateSchemaLabel('${type}', ${idx}, this.value)" placeholder="題目名稱" class="flex-1 h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
            <select onchange="window.updateSchemaType('${type}', ${idx}, this.value)" class="h-10 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600">
                <option value="text" ${item.type === 'text' ? 'selected' : ''}>單行文字</option>
                <option value="textarea" ${item.type === 'textarea' ? 'selected' : ''}>多行長文</option>
                <option value="tel" ${item.type === 'tel' ? 'selected' : ''}>電話格式</option>
            </select>
            <button type="button" onclick="window.removeSchemaItem('${type}', ${idx})" class="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-200/60 transition-colors">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
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
                            <textarea id="dynamic-${type}-${field.id}" rows="3" class="w-full p-3 bg-slate-50/50 border border-slate-200/80 rounded-xl text-xs">${val}</textarea>
                        ` : `
                            <input type="${field.type || 'text'}" id="dynamic-${type}-${field.id}" value="${val}" class="w-full p-3 bg-slate-50/50 border border-slate-200/80 rounded-xl ${field.type === 'tel' ? 'font-mono font-bold text-slate-700' : ''} text-xs">
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
                <button onclick="window.removeCoupon(${idx})" class="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-xl shrink-0 transition-colors">
                    <i data-lucide="trash" class="w-4 h-4"></i>
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

    // 抽屜選單
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
        document.getElementById('modal-country').classList.remove('hidden');
    });
    document.getElementById('btn-close-country-modal')?.addEventListener('click', () => document.getElementById('modal-country').classList.add('hidden'));
    document.getElementById('btn-cancel-country-modal')?.addEventListener('click', () => document.getElementById('modal-country').classList.add('hidden'));

    document.getElementById('form-country-create')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('create-country-name').value.trim();
        const initData = {
            currency: "", timezone: "", regions: [], coverImages: [], notice: {}, emergency: {}
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

    if (window.lucide) lucide.createIcons();
});
