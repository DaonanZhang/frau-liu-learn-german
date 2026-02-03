import { apiFetch } from "../client";

const BASE = "/learning_by_video";

/**
 * Fetch module-level user data for learning-by-video.
 *
 * Returns module user data plus derived statistics
 * (favorite_count / completed_count).
 *
 * Requires authentication.
 *
 * @returns {Promise<{
 *   id: number,
 *   user_data: number,
 *   last_watched_video: number | null,
 *   favorite_count: number,
 *   completed_count: number,
 *   updated_at: string,
 * }>}
 */
export function fetchLearningVideoUserData() {
  return apiFetch(`${BASE}/me/learning-video/`, { method: "GET" });
}

/**
 * Patch module-level user data for learning-by-video.
 *
 * ⚠️ Note:
 * - favorite_count / completed_count are derived fields
 *   and CANNOT be patched directly.
 * - They are calculated from user_video_mark records.
 *
 * @param {{
 *   last_watched_video?: number | null
 * }} patchBody
 *
 * @returns {Promise<{
 *   id: number,
 *   user_data: number,
 *   last_watched_video: number | null,
 *   favorite_count: number,
 *   completed_count: number,
 *   updated_at: string,
 * }>}
 */
export function patchLearningVideoUserData(patchBody) {
  return apiFetch(`${BASE}/me/learning-video/`, {
    method: "PATCH",
    body: patchBody,
  });
}

/**
 * Replace module-level user data for learning-by-video.
 *
 * ⚠️ Usually NOT needed.
 * Prefer PATCH instead of PUT unless you explicitly want full replacement.
 *
 * @param {{
 *   last_watched_video: number | null
 * }} body
 *
 * @returns {Promise<{
 *   id: number,
 *   user_data: number,
 *   last_watched_video: number | null,
 *   favorite_count: number,
 *   completed_count: number,
 *   updated_at: string,
 * }>}
 */
export function putLearningVideoUserData(body) {
  return apiFetch(`${BASE}/me/learning-video/`, {
    method: "PUT",
    body,
  });
}

/**
 * Update module-level learning-by-video user data (PATCH).
 *
 * @deprecated
 * This function is kept for backward compatibility.
 * Prefer `patchLearningVideoUserData`.
 *
 * @param {{
 *   last_watched_video?: number | null
 * }} payload
 *
 * @returns {Promise<{
 *   id: number,
 *   user_data: number,
 *   last_watched_video: number | null,
 *   favorite_count: number,
 *   completed_count: number,
 *   updated_at: string,
 * }>}
 */
export async function updateLearningVideoUserData(payload) {
  return apiFetch("/learning_by_video/learning-video-user-data/me/", {
    method: "PATCH",
    body: payload,
  });
}
