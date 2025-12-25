import { apiFetch } from "./client";

/**
 * Example API wrappers.
 * Adjust endpoints to your Django urls.
 */

export function listVideos({ page = 1, difficulty = "", ordering = "-created_at" } = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (difficulty) params.set("difficulty", difficulty);
  if (ordering) params.set("ordering", ordering);

  return apiFetch(`/learning_by_video/videos/?${params.toString()}`);
}

export function getVideoDetail(videoId) {
  return apiFetch(`/learning_by_video/videos/${videoId}/`);
}
