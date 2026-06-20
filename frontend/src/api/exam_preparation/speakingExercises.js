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

export async function fetchSpeakingGapMatchingExercises() {
  const data = await apiFetch(`${BASE}/speaking-gap-matching-exercises/`);
  return normalizeList(data);
}

export function fetchSpeakingGapMatchingExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/speaking-gap-matching-exercises/${exerciseId}/`);
}

export async function fetchSpeakingPromptSegmentedExercises() {
  const data = await apiFetch(`${BASE}/speaking-prompt-segmented-exercises/`);
  return normalizeList(data);
}

export function fetchSpeakingPromptSegmentedExerciseDetail(exerciseId) {
  return apiFetch(`${BASE}/speaking-prompt-segmented-exercises/${exerciseId}/`);
}

export async function fetchSpeakingGapBlankStates(exerciseId) {
  const query = exerciseId ? `?blank__exercise=${encodeURIComponent(exerciseId)}` : "";
  const data = await apiFetch(`${BASE}/user-speaking-gap-blank-states/${query}`);
  return normalizeList(data);
}

export function saveSpeakingGapBlankState(payload) {
  return apiFetch(`${BASE}/user-speaking-gap-blank-states/`, {
    method: "POST",
    body: payload,
  });
}

export async function fetchSpeakingPromptSegmentedExerciseStates(exerciseId) {
  const query = exerciseId ? `?exercise=${encodeURIComponent(exerciseId)}` : "";
  const data = await apiFetch(`${BASE}/user-speaking-prompt-segmented-exercise-states/${query}`);
  return normalizeList(data);
}

export function saveSpeakingPromptSegmentedExerciseState(payload) {
  return apiFetch(`${BASE}/user-speaking-prompt-segmented-exercise-states/`, {
    method: "POST",
    body: payload,
  });
}
