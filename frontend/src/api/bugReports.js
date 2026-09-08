import { apiFetch } from "./client.js";

function detectBrowser(userAgent) {
  if (/Edg\//.test(userAgent)) return "Microsoft Edge";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/CriOS\//.test(userAgent)) return "Chrome iOS";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return "Safari";
  return "未知浏览器";
}

export function collectBrowserInfo() {
  const userAgent = navigator.userAgent || "";
  return {
    browser: detectBrowser(userAgent),
    language: navigator.language || "",
    languages: Array.from(navigator.languages || []),
    platform: navigator.userAgentData?.platform || navigator.platform || "",
    vendor: navigator.vendor || "",
    user_agent_brands: Array.from(navigator.userAgentData?.brands || []),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    pixel_ratio: window.devicePixelRatio || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
  };
}

export function submitBugReport(payload) {
  return apiFetch("/accounts/bug-reports/", {
    method: "POST",
    body: payload,
  });
}
