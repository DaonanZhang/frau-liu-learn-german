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

export async function fetchClozeChoiceExercises() {
  const data = await apiFetch(`${BASE}/cloze-choice-exercises/`);
  return normalizeList(data);
}

export function fetchClozeChoiceExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/cloze-choice-exercises/${exerciseId}/`);
}

export async function fetchClozeMatchingExercises() {
  const data = await apiFetch(`${BASE}/cloze-matching-exercises/`);
  return normalizeList(data);
}

export function fetchClozeMatchingExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/cloze-matching-exercises/${exerciseId}/`);
}
