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
 * @param {{ username?: string, email?: string | null }} payload
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
