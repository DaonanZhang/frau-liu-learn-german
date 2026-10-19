import { examPreparationScopeQuery } from "../../utils/examPreparationScope.js";
import { fetchExamPreparationContent } from "./contentText.js";

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

export async function fetchReadingUnderstandingExercises(scope) {
  const query = examPreparationScopeQuery(scope);
  if (!query) return { results: [], count: 0 };
  const data = await fetchExamPreparationContent(`${BASE}/reading-understanding-exercises/?${query}`);
  return normalizeList(data);
}

export function fetchReadingUnderstandingExerciseDetail(exerciseId, scope) {
  const query = examPreparationScopeQuery(scope);
  if (!query) return Promise.reject(new Error("Invalid exam preparation scope"));
  return fetchExamPreparationContent(`${BASE}/reading-understanding-exercises/${exerciseId}/?${query}`);
}

