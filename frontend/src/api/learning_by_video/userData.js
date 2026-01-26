import { apiFetch } from "../client";

const BASE = "/learning_by_video";

/**
 * Fetch module-level user data for learning-by-video.
 * Requires authentication (typically).
 */
export function fetchLearningVideoUserData() {
  return apiFetch(`${BASE}/me/learning-video/`, { method: "GET" });
}

/**
 * Patch module-level user data.
 */
export function patchLearningVideoUserData(patchBody) {
  return apiFetch(`${BASE}/me/learning-video/`, {
    method: "PATCH",
    body: patchBody,
  });
}

/**
 * Replace module-level user data.
 */
export function putLearningVideoUserData(body) {
  return apiFetch(`${BASE}/me/learning-video/`, {
    method: "PUT",
    body,
  });
}

/**
 * Patch module-level user data for learning-by-video.
 *
 * @param {{ completed_videos?: number, last_watched_video?: number | null }} payload
 * @returns {Promise<{
 *   id: number,
 *   user_data: number,
 *   completed_videos: number,
 *   last_watched_video: number | null,
 *   updated_at: string,
 * }>}
 */
export async function updateLearningVideoUserData(payload) {
  return apiFetch("/learning_by_video/learning-video-user-data/me/", {
    method: "PATCH",
    body: payload,
  });
}