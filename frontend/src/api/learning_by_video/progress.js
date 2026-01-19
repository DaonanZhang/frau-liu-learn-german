import { apiFetch } from "../client";

const BASE = "/learning_by_video";

/**
 * Fetch current user's progress for a video.
 * Requires authentication (IsAuthenticated).
 */
export function fetchVideoProgress(videoId) {
  return apiFetch(`${BASE}/videos/${videoId}/progress/`, {
    method: "GET",
  });
}

/**
 * Update progress (PATCH).
 * - current_time: number (seconds)
 * - completed: boolean
 */
export function patchVideoProgress(videoId, { current_time, completed } = {}) {
  const body = {};
  if (current_time !== undefined) body.current_time = current_time;
  if (completed !== undefined) body.completed = completed;

  return apiFetch(`${BASE}/videos/${videoId}/progress/`, {
    method: "PATCH",
    body,
  });
}

/**
 * Replace progress (PUT).
 */
export function putVideoProgress(videoId, { current_time, completed } = {}) {
  return apiFetch(`${BASE}/videos/${videoId}/progress/`, {
    method: "PUT",
    body: { current_time, completed },
  });
}
