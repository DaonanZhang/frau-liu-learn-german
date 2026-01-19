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
