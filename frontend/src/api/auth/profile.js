import { apiFetch } from "../client";

/**
 * Fetch current user profile.
 *
 * @returns {Promise<{
 *   id: number,
 *   telephone: string,
 *   country_code: string,
 *   username: string,
 *   email: string | null,
 * }>}
 */
export function fetchMyProfile() {
  return apiFetch("/accounts/users/me/", {
    method: "GET",
  });
}

/**
 * Update current user profile.
 *
 * @param {{
 *   username?: string,
 *   email?: string | null,
 *   has_seen_schreiben_guide?: boolean,
 *   has_seen_b2_schreiben_guide?: boolean,
 * }} payload
 * @returns {Promise<{
 *   id: number,
 *   telephone: string,
 *   country_code: string,
 *   username: string,
 *   email: string | null,
 * }>}
 */
export function updateMyProfile(payload) {
  return apiFetch("/accounts/users/me/", {
    method: "PATCH",
    body: payload,
  });
}

export function createPromotionCodes(payload) {
  return apiFetch("/accounts/users/promotion-codes/", {
    method: "POST",
    body: payload,
  });
}

export function fetchPromotionCodeHistory({ search = "", page = 1 } = {}) {
  const params = new URLSearchParams();
  const normalizedSearch = String(search).trim();
  if (normalizedSearch) {
    params.set("search", normalizedSearch);
  }
  params.set("page", String(Math.max(1, Math.floor(Number(page)) || 1)));
  return apiFetch(`/accounts/users/promotion-codes/?${params.toString()}`, {
    method: "GET",
  });
}

export function fetchPromotionCodeDetails(generationBatchId) {
  const params = new URLSearchParams({ generation_batch_id: generationBatchId });
  return apiFetch(`/accounts/users/promotion-codes/?${params.toString()}`, { method: "GET" });
}
