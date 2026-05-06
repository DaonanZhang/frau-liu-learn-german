import { apiFetch } from "../client.js";

export function fetchWeChatQr() {
  return apiFetch("/accounts/homepage-settings/wechat-qr/", {
    method: "GET",
  });
}

export function uploadWeChatQr(file) {
  const formData = new FormData();
  formData.append("wechat_qr_image", file);

  return apiFetch("/accounts/homepage-settings/wechat-qr/", {
    method: "POST",
    body: formData,
  });
}
