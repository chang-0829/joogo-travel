// js/components/coverManager.js
import { uploadToCloudinary } from "../api/uploadApi.js";

export class CoverManager {
    constructor({ containerId, previewStripId, dropzoneId, fileInputId, onCoverChange, onToast }) {
        this.container = document.getElementById(containerId);
        this.previewStrip = document.getElementById(previewStripId);
        this.dropzone = document.getElementById(dropzoneId);
        this.fileInput = document.getElementById(fileInputId);
        this.onCoverChange = onCoverChange;
        this.showToast = onToast;

        this.covers = [];
        this.isUploading = false;
        this.abortController = null;

        this.initEvents();
    }

    setCovers(coversArray) {
        this.covers = [...coversArray];
        this.render();
    }

    getCovers() {
        return this.covers;
    }

    render() {
        if (this.previewStrip) {
            this.previewStrip.innerHTML = this.covers.slice(0, 3).map(u => `
                <img src="${u}" class="w-6 h-6 rounded-full object-cover border-2 border-white shadow-2xs">
            `).join('');
        }

        if (!this.container) return;

        if (this.covers.length === 0) {
            this.container.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-slate-300">尚未上傳任何封面照片</div>`;
            return;
        }

        this.container.innerHTML = this.covers.map((imgUrl, idx) => {
            const isDefault = idx === 0;
            return `
            <div class="relative group rounded-2xl overflow-hidden aspect-video bg-slate-100 border ${isDefault ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200/80'} shadow-2xs">
                <img src="${imgUrl}" class="w-full h-full object-cover">
                
                <div class="absolute top-1.5 left-1.5 flex items-center">
                    ${isDefault ? `
                        <span class="h-6 px-2 text-[10px] font-bold bg-brand-500 text-white rounded-md shadow-xs inline-flex items-center gap-1 leading-none">
                            <i data-lucide="check" class="w-3 h-3"></i>
                            <span>預設封面</span>
                        </span>
                    ` : `
                        <button type="button" data-action="set-default" data-index="${idx}" class="h-6 px-2 text-[10px] font-semibold bg-slate-900/65 hover:bg-slate-900 text-white rounded-md shadow-xs transition-all opacity-85 hover:opacity-100 inline-flex items-center justify-center leading-none">
                            <span>設為預設</span>
                        </button>
                    `}
                </div>

                <button type="button" data-action="remove-cover" data-index="${idx}" class="w-7 h-7 bg-slate-900/75 hover:bg-rose-600 text-white rounded-full flex items-center justify-center absolute top-1.5 right-1.5 shadow-md transition-all active:scale-90">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    initEvents() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleUpload(e.target.files));
        }

        if (this.dropzone) {
            ['dragenter', 'dragover'].forEach(name => {
                this.dropzone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.dropzone.classList.add('border-brand-500', 'bg-brand-50/50');
                });
            });

            ['dragleave', 'drop'].forEach(name => {
                this.dropzone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.dropzone.classList.remove('border-brand-500', 'bg-brand-50/50');
                });
            });

            this.dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    this.handleUpload(dt.files);
                }
            });
        }

        if (this.container) {
            this.container.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const action = btn.dataset.action;
                const index = parseInt(btn.dataset.index, 10);

                if (action === 'set-default') {
                    const target = this.covers.splice(index, 1)[0];
                    this.covers.unshift(target);
                    this.render();
                    if (this.onCoverChange) this.onCoverChange(this.covers);
                    this.showToast("已更新預設封面");
                } else if (action === 'remove-cover') {
                    this.covers.splice(index, 1);
                    this.render();
                    if (this.onCoverChange) this.onCoverChange(this.covers);
                }
            });
        }
    }

    async handleUpload(fileList) {
        const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (!files.length) {
            this.showToast("未偵測到有效圖片檔案");
            return;
        }

        this.abortController = new AbortController();
        this.isUploading = true;

        const dropLabel = document.getElementById('dropzone-label-text');
        const dropIcon = document.getElementById('dropzone-icon-container');

        if (dropLabel) dropLabel.innerText = `正在上傳 ${files.length} 張照片...`;
        if (dropIcon) dropIcon.classList.add('animate-bounce');
        this.showToast(`正在上傳 ${files.length} 張照片至雲端...`);

        try {
            for (const file of files) {
                if (!this.isUploading || this.abortController.signal.aborted) break;
                const cloudUrl = await uploadToCloudinary(file, this.abortController.signal);
                this.covers.push(cloudUrl);
                this.render();
                if (this.onCoverChange) this.onCoverChange(this.covers);
            }
            if (this.isUploading) this.showToast("全部圖片上傳完成！");
        } catch (err) {
            if (err.name !== 'AbortError' && this.isUploading) {
                this.showToast("圖片上傳失敗：" + err.message);
            }
        } finally {
            this.isUploading = false;
            this.abortController = null;
            if (dropLabel) dropLabel.innerText = "點擊選取或將照片拖曳至此上傳";
            if (dropIcon) dropIcon.classList.remove('animate-bounce');
            if (this.fileInput) this.fileInput.value = "";
        }
    }

    abortUpload() {
        if (this.isUploading && this.abortController) {
            this.abortController.abort();
            this.isUploading = false;
            this.showToast("已終止未完成的圖片上傳");
            const dropLabel = document.getElementById('dropzone-label-text');
            const dropIcon = document.getElementById('dropzone-icon-container');
            if (dropLabel) dropLabel.innerText = "點擊選取或將照片拖曳至此上傳";
            if (dropIcon) dropIcon.classList.remove('animate-bounce');
            if (this.fileInput) this.fileInput.value = "";
        }
    }
}
