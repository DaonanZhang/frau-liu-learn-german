import { apiFetch } from "./client.js";

export async function fetchMyCoupons() {
  const data = await apiFetch("/accounts/coupons/");
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data?.results) ? data.results : [];
}

export async function fetchCouponChoices(offerCode) {
  const params = new URLSearchParams({ offer_code: String(offerCode || "").trim() });
  return apiFetch(`/accounts/coupons/choices/?${params.toString()}`);
}
