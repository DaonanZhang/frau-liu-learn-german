import { apiFetch } from "../client";

/**
 * Base prefix derived from backend:
 * path("api/learning_by_video/", include("apps.learning_by_video.urls"))
 */
const BASE = "/learning_by_video";

export async function fetchVideoMeta({ seasonNumbers, seasonNumber } = {}) {
  const sp = new URLSearchParams();
  if (Array.isArray(seasonNumbers) && seasonNumbers.length) {
    sp.set("season_number", seasonNumbers.join(","));
  } else if (seasonNumber) {
    sp.set("season_number", String(seasonNumber));
  }
  const qs = sp.toString();
  return apiFetch(qs ? `${BASE}/videos/meta/?${qs}` : `${BASE}/videos/meta/`);
}
