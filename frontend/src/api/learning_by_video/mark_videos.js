import { apiFetch } from "../client";

const BASE = "/learning_by_video/user-video-marks";

/**
 * @typedef {Object} UserVideoMark
 * @property {number} id - Mark record id.
 * @property {number} video - Video id.
 * @property {boolean} is_favorite - Whether the video is favorited by the user.
 * @property {boolean} is_completed - Whether the video is completed by the user.
 * @property {string|null} favorited_at - ISO timestamp when favorited; null if not favorited.
 * @property {string|null} completed_at - ISO timestamp when completed; null if not completed.
 * @property {string} updated_at - ISO timestamp of last update.
 * @property {string} created_at - ISO timestamp of creation.
 */

/**
 * Fetch mark status for a specific video (get-or-create behavior depends on backend).
 *
 * @param {number|string} videoId - Video primary key.
 * @returns {Promise<UserVideoMark>} Mark record.
 */
export function fetchUserVideoMarkByVideoId(videoId) {
  const parsedVideoId = Number(videoId);
  if (!Number.isFinite(parsedVideoId) || parsedVideoId <= 0) {
    throw new Error("fetchUserVideoMarkByVideoId: invalid videoId");
  }

  return apiFetch(`${BASE}/by-video/${parsedVideoId}/`, { method: "GET" });
}

/**
 * Patch mark status for a specific video.
 *
 * At least one field must be provided:
 * - is_favorite
 * - is_completed
 *
 * @param {number|string} videoId - Video primary key.
 * @param {{ is_favorite?: boolean, is_completed?: boolean }} patchBody - Partial mark payload.
 * @returns {Promise<UserVideoMark>} Updated mark record.
 */
export function patchUserVideoMarkByVideoId(videoId, patchBody) {
  const parsedVideoId = Number(videoId);
  if (!Number.isFinite(parsedVideoId) || parsedVideoId <= 0) {
    throw new Error("patchUserVideoMarkByVideoId: invalid videoId");
  }

  const hasFavorite = Object.prototype.hasOwnProperty.call(patchBody || {}, "is_favorite");
  const hasCompleted = Object.prototype.hasOwnProperty.call(patchBody || {}, "is_completed");
  if (!hasFavorite && !hasCompleted) {
    throw new Error("patchUserVideoMarkByVideoId: provide is_favorite and/or is_completed");
  }

  return apiFetch(`${BASE}/by-video/${parsedVideoId}/`, {
    method: "PATCH",
    body: patchBody,
  });
}

/**
 * Set/unset favorite for a video.
 *
 * @param {number|string} videoId - Video primary key.
 * @param {boolean} isFavorite - True to favorite, false to unfavorite.
 * @returns {Promise<UserVideoMark>} Updated mark record.
 */
export function setVideoFavorite(videoId, isFavorite) {
  return patchUserVideoMarkByVideoId(videoId, { is_favorite: isFavorite });
}

/**
 * Set/unset completed for a video.
 *
 * @param {number|string} videoId - Video primary key.
 * @param {boolean} isCompleted - True to mark completed, false to unmark completed.
 * @returns {Promise<UserVideoMark>} Updated mark record.
 */
export function setVideoCompleted(videoId, isCompleted) {
  return patchUserVideoMarkByVideoId(videoId, { is_completed: isCompleted });
}

/**
 * Toggle favorite for a video (reads current state, then flips it).
 *
 * @param {number|string} videoId - Video primary key.
 * @returns {Promise<UserVideoMark>} Updated mark record.
 */
export async function toggleVideoFavorite(videoId) {
  const currentMark = await fetchUserVideoMarkByVideoId(videoId);
  const nextValue = !currentMark?.is_favorite;
  return setVideoFavorite(videoId, nextValue);
}

/**
 * Toggle completed for a video (reads current state, then flips it).
 *
 * @param {number|string} videoId - Video primary key.
 * @returns {Promise<UserVideoMark>} Updated mark record.
 */
export async function toggleVideoCompleted(videoId) {
  const currentMark = await fetchUserVideoMarkByVideoId(videoId);
  const nextValue = !currentMark?.is_completed;
  return setVideoCompleted(videoId, nextValue);
}

/**
 * Fetch all favorited marks for the current user.
 *
 * @returns {Promise<UserVideoMark[]>} List of mark records.
 */
export function fetchFavoriteVideoMarks() {
  return apiFetch(`${BASE}/favorites/`, { method: "GET" });
}

/**
 * Fetch all completed marks for the current user.
 *
 * @returns {Promise<UserVideoMark[]>} List of mark records.
 */
export function fetchCompletedVideoMarks() {
  return apiFetch(`${BASE}/completed/`, { method: "GET" });
}
