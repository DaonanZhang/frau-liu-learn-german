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

export async function fetchSpeakingTeilExercises(teil, scope) {
  const scopeQuery = examPreparationScopeQuery(scope);
  if (!scopeQuery) return { results: [], count: 0 };
  const query = `?${scopeQuery}${teil ? `&exercise_base__exercise_type=SPEAKING_TEIL${encodeURIComponent(teil)}` : ""}`;
  const data = await fetchExamPreparationContent(`${BASE}/speaking-teil-exercises/${query}`);
  return normalizeList(data);
}

export function fetchSpeakingTeilExerciseDetail(exerciseId, scope) {
  const query = examPreparationScopeQuery(scope);
  if (!query) return Promise.reject(new Error("Invalid exam preparation scope"));
  return fetchExamPreparationContent(`${BASE}/speaking-teil-exercises/${exerciseId}/?${query}`);
}
