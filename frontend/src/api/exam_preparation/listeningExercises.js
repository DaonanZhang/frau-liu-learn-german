import { apiFetch } from "../client";

const BASE = "/exam_preparation";

function normalizeList(data) {
  if (Array.isArray(data)) {
    return { results: data, count: data.length };
  }
  if (data && Array.isArray(data.results)) {
    return { results: data.results, count: data.count ?? data.results.length };
  }
  return { results: [], count: 0 };
}

export async function fetchListeningExercises(listeningType) {
  const query = listeningType ? `?listening_type=${encodeURIComponent(listeningType)}` : "";
  const data = await apiFetch(`${BASE}/listening-exercises/${query}`);
  return normalizeList(data);
}

export function fetchListeningExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/listening-exercises/${exerciseId}/`);
}
