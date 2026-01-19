import { apiFetch } from "../client";

const BASE = "/learning_by_video";

/**
 * Fetch subtitles list.
 * NOTE: Adjust query parameter name to match backend if needed.
 * Common patterns: ?video=<id> or ?video_id=<id>
 */
export async function fetchSubtitlesByVideo(videoId, { paramName = "video" } = {}) {
  const sp = new URLSearchParams();
  sp.set(paramName, String(videoId));

  const data = await apiFetch(`${BASE}/subtitles/?${sp.toString()}`);
  return Array.isArray(data) ? data : data?.results ?? [];
}
