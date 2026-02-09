import { apiFetch } from "../client";

/**
 * Base prefix derived from backend:
 * path("api/learning_by_video/", include("apps.learning_by_video.urls"))
 */
const BASE = "/learning_by_video";

export async function fetchVideoMeta() {
  return apiFetch(`${BASE}/videos/meta/`);
}
