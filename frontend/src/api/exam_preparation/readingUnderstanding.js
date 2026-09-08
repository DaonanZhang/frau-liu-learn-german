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

export async function fetchReadingUnderstandingExercises() {
  const data = await apiFetch(`${BASE}/reading-understanding-exercises/`);
  return normalizeList(data);
}

export function fetchReadingUnderstandingExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/reading-understanding-exercises/${exerciseId}/`);
}

