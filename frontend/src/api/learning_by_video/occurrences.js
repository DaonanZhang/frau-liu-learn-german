import { apiFetch } from "../client";

const BASE = "/learning_by_video/occurrences";

/**
 * Generic helper for occurrences endpoints.
 */
async function fetchOccurrences(path, params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });

  const qs = sp.toString();
  const url = qs ? `${path}?${qs}` : path;

  const data = await apiFetch(url);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

/**
 * Word occurrences.
 * params suggestions:
 * - video: videoId
 * - subtitle: subtitleId
 * - t_from / t_to (or time_start/time_end) depending on backend
 */
export function fetchWordOccurrences(params = {}) {
  return fetchOccurrences(`${BASE}/words/`, params);
}

export function fetchSentenceOccurrences(params = {}) {
  return fetchOccurrences(`${BASE}/sentences/`, params);
}

export function fetchExpressionOccurrences(params = {}) {
  return fetchOccurrences(`${BASE}/expressions/`, params);
}
