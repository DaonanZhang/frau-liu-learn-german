import { apiFetch } from "./client.js";

export function fetchReferralCampaign() {
  return apiFetch("/accounts/referral-campaign/");
}

export async function fetchUnreadReferralNotices() {
  const data = await apiFetch("/accounts/referral-notices/unread/");
  return Array.isArray(data) ? data : [];
}

export function acknowledgeReferralNotice(id) {
  return apiFetch(`/accounts/referral-notices/${encodeURIComponent(id)}/acknowledge/`, { method: "POST" });
}
