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

export async function fetchSpeakingTeilExercises(teil) {
  const query = teil ? `?exercise_base__exercise_type=SPEAKING_TEIL${encodeURIComponent(teil)}` : "";
  const data = await apiFetch(`${BASE}/speaking-teil-exercises/${query}`);
  return normalizeList(data);
}

export function fetchSpeakingTeilExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/speaking-teil-exercises/${exerciseId}/`);
}
