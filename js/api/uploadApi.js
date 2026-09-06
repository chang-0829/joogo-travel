// js/api/uploadApi.js

const CLOUD_NAME = "你的_CLOUD_NAME"; 
const UPLOAD_PRESET = "你的_UPLOAD_PRESET_名稱";

/**
 * 將 File 物件直傳至 Cloudinary (支援 AbortSignal 中斷)
 * @param {File} file 圖片檔案
 * @param {AbortSignal} [signal] 中斷信號
 * @returns {Promise<string>} 回傳 Cloudinary 圖片 CDN 公開網址
 */
export async function uploadToCloudinary(file, signal) {
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    signal: signal // 支援中斷請求
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "圖片上傳失敗");
  }

  const data = await response.json();
  return data.secure_url;
}
