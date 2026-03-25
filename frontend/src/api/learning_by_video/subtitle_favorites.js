import { apiFetch } from "../client";

const BASE = "/learning_by_video/user-subtitle-favorites";

/**
 * @typedef {Object} UserSubtitleFavorite
 * @property {number} id - Favorite record id.
 * @property {number} subtitle - Subtitle id.
 * @property {number} video - Video id.
 * @property {string} created_at - ISO timestamp of favorite creation.
 */

function normalizeListResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.results)) {
    return data.results;
  }
  return [];
}

function toPositiveInteger(value, functionName, argumentName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${functionName}: invalid ${argumentName}`);
  }
  return parsed;
}

/**
 * Fetch current user's favorited subtitles.
 *
 * Supports optional filters:
 * - video: only favorites under this video id
 * - subtitle: only specific subtitle favorite
 * - ordering: e.g. "-created_at" / "created_at"
 *
 * @param {{ video?: number|string, subtitle?: number|string, ordering?: string }} params
 * @returns {Promise<UserSubtitleFavorite[]>}
 */
export async function fetchUserSubtitleFavorites(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  const url = queryString ? `${BASE}/?${queryString}` : `${BASE}/`;
  const data = await apiFetch(url, { method: "GET" });
  return normalizeListResponse(data);
}

/**
 * Fetch current user's favorited subtitles under one video.
 *
 * @param {number|string} videoId
 * @returns {Promise<UserSubtitleFavorite[]>}
 */
export function fetchUserSubtitleFavoritesByVideo(videoId) {
  const parsedVideoId = toPositiveInteger(
    videoId,
    "fetchUserSubtitleFavoritesByVideo",
    "videoId"
  );

  return fetchUserSubtitleFavorites({ video: parsedVideoId });
}

/**
 * Fetch favorite record for one subtitle id of current user.
 *
 * @param {number|string} subtitleId
 * @returns {Promise<UserSubtitleFavorite|null>}
 */
export async function fetchUserSubtitleFavoriteBySubtitleId(subtitleId) {
  const parsedSubtitleId = toPositiveInteger(
    subtitleId,
    "fetchUserSubtitleFavoriteBySubtitleId",
    "subtitleId"
  );
  const list = await fetchUserSubtitleFavorites({ subtitle: parsedSubtitleId });
  return list.length > 0 ? list[0] : null;
}

/**
 * Create subtitle favorite record for current user.
 *
 * @param {number|string} subtitleId
 * @returns {Promise<UserSubtitleFavorite>}
 */
export function createUserSubtitleFavorite(subtitleId) {
  const parsedSubtitleId = toPositiveInteger(
    subtitleId,
    "createUserSubtitleFavorite",
    "subtitleId"
  );
  return apiFetch(`${BASE}/`, {
    method: "POST",
    body: { subtitle: parsedSubtitleId },
  });
}

/**
 * Delete subtitle favorite record by favorite id.
 *
 * @param {number|string} favoriteId
 * @returns {Promise<null|undefined>}
 */
export function deleteUserSubtitleFavoriteById(favoriteId) {
  const parsedFavoriteId = toPositiveInteger(
    favoriteId,
    "deleteUserSubtitleFavoriteById",
    "favoriteId"
  );
  return apiFetch(`${BASE}/${parsedFavoriteId}/`, { method: "DELETE" });
}

/**
 * Set subtitle favorite state by subtitle id.
 *
 * @param {number|string} subtitleId
 * @param {boolean} isFavorite
 * @returns {Promise<UserSubtitleFavorite|null>}
 */
export async function setSubtitleFavorite(subtitleId, isFavorite) {
  const parsedSubtitleId = toPositiveInteger(
    subtitleId,
    "setSubtitleFavorite",
    "subtitleId"
  );
  const nextValue = Boolean(isFavorite);

  if (nextValue) {
    return createUserSubtitleFavorite(parsedSubtitleId);
  }

  const existing = await fetchUserSubtitleFavoriteBySubtitleId(parsedSubtitleId);
  if (!existing?.id) {
    return null;
  }
  await deleteUserSubtitleFavoriteById(existing.id);
  return null;
}

/**
 * Toggle subtitle favorite state by subtitle id.
 *
 * @param {number|string} subtitleId
 * @returns {Promise<UserSubtitleFavorite|null>} New state payload, null means unfavorited.
 */
export async function toggleSubtitleFavorite(subtitleId) {
  const existing = await fetchUserSubtitleFavoriteBySubtitleId(subtitleId);
  if (existing?.id) {
    await deleteUserSubtitleFavoriteById(existing.id);
    return null;
  }
  return createUserSubtitleFavorite(subtitleId);
}
