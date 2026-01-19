import { apiFetch } from "../client";

const BASE = "/learning_by_video";

/**
 * Fetch exercise questions.
 * NOTE: Adjust filter params to match backend if needed.
 * Common patterns: ?video=<id>
 */
export async function fetchExerciseQuestions({ videoId, paramName = "video" } = {}) {
  const sp = new URLSearchParams();
  if (videoId !== undefined && videoId !== null) {
    sp.set(paramName, String(videoId));
  }

  const qs = sp.toString();
  const url = qs
    ? `${BASE}/exercise-questions/?${qs}`
    : `${BASE}/exercise-questions/`;

  const data = await apiFetch(url);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}
