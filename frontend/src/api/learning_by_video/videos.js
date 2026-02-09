import { apiFetch } from "../client";

/**
 * Base prefix derived from backend:
 * path("api/learning_by_video/", include("apps.learning_by_video.urls"))
 */
const BASE = "/learning_by_video";

/**
 * Normalize DRF list responses.
 */
function normalizeList(data) {
  if (Array.isArray(data)) return { results: data, count: data.length };
  if (data && Array.isArray(data.results)) {
    return { results: data.results, count: data.count ?? data.results.length };
  }
  return { results: [], count: 0 };
}

/**
 * Fetch videos list.
 * Supported by VideoViewSet:
 * - search (title)
 * - difficulty
 * - ordering: created_at, difficulty, duration_seconds
 */
export async function fetchVideoList({
  search,
  difficulty,
  creator,
  topic,
  duration,
  ordering,
} = {}) {
  const sp = new URLSearchParams();
  if (search) sp.set("search", search);
  if (difficulty && difficulty.length) sp.set("difficulty", difficulty.join(","));
  if (creator && creator.length) sp.set("creator", creator.join(","));
  if (topic && topic.length) sp.set("topic", topic.join(","));
  if (duration && duration.length) sp.set("duration", duration.join(","));
  if (ordering) sp.set("ordering", ordering);

  const qs = sp.toString();
  const path = qs ? `${BASE}/videos/?${qs}` : `${BASE}/videos/`;

  const data = await apiFetch(path);
  return normalizeList(data);
}

/**
 * Fetch video detail.
 * Your retrieve() supports include_subtitles query param: 1/true/True.
 */
export function fetchVideoDetail(videoId, { includeSubtitles = false } = {}) {
  const sp = new URLSearchParams();
  if (includeSubtitles) sp.set("include_subtitles", "1");
  const qs = sp.toString();
  const path = qs
    ? `${BASE}/videos/${videoId}/?${qs}`
    : `${BASE}/videos/${videoId}/`;

  return apiFetch(path);
}
