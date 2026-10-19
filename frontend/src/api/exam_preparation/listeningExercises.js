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

export async function fetchListeningExercises(listeningType, scope) {
  const scopeQuery = examPreparationScopeQuery(scope);
  if (!scopeQuery) return { results: [], count: 0 };
  const query = `?${scopeQuery}${listeningType ? `&listening_type=${encodeURIComponent(listeningType)}` : ""}`;
  const data = await fetchExamPreparationContent(`${BASE}/listening-exercises/${query}`);
  return normalizeList(data);
}

export function fetchListeningExerciseDetail(exerciseId, scope) {
  const query = examPreparationScopeQuery(scope);
  if (!query) return Promise.reject(new Error("Invalid exam preparation scope"));
  return fetchExamPreparationContent(`${BASE}/listening-exercises/${exerciseId}/?${query}`);
}
