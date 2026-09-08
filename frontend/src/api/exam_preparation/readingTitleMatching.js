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

export async function fetchReadingTitleMatchingExercises() {
  const data = await apiFetch(`${BASE}/reading-title-matching-exercises/`);
  return normalizeList(data);
}

export function fetchReadingTitleMatchingExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/reading-title-matching-exercises/${exerciseId}/`);
}

