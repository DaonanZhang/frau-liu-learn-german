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

function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function fetchStateList(endpoint, filters = {}) {
  const data = await apiFetch(`${BASE}/${endpoint}/${buildQuery(filters)}`);
  return normalizeList(data);
}

function saveState(endpoint, payload) {
  return apiFetch(`${BASE}/${endpoint}/`, {
    method: "POST",
    body: payload,
  });
}

export const fetchListeningQuestionStates = (exerciseId) =>
  fetchStateList("user-listening-question-states", { "question__listening_exercise": exerciseId });

export const saveListeningQuestionState = (payload) =>
  saveState("user-listening-question-states", payload);

export const fetchReadingUnderstandingQuestionStates = (exerciseId) =>
  fetchStateList("user-reading-understanding-question-states", { "question__exercise": exerciseId });

export const saveReadingUnderstandingQuestionState = (payload) =>
  saveState("user-reading-understanding-question-states", payload);

export const fetchReadingTitleMatchingItemStates = (exerciseId) =>
  fetchStateList("user-reading-title-matching-item-states", { "item__exercise": exerciseId });

export const saveReadingTitleMatchingItemState = (payload) =>
  saveState("user-reading-title-matching-item-states", payload);

export const fetchReadingAdMatchingItemStates = (exerciseId) =>
  fetchStateList("user-reading-ad-matching-item-states", { "item__exercise": exerciseId });

export const saveReadingAdMatchingItemState = (payload) =>
  saveState("user-reading-ad-matching-item-states", payload);

export const fetchClozeChoiceBlankStates = (exerciseId) =>
  fetchStateList("user-cloze-choice-blank-states", { "blank__exercise": exerciseId });

export const saveClozeChoiceBlankState = (payload) =>
  saveState("user-cloze-choice-blank-states", payload);

export const fetchClozeMatchingBlankStates = (exerciseId) =>
  fetchStateList("user-cloze-matching-blank-states", { "blank__exercise": exerciseId });

export const saveClozeMatchingBlankState = (payload) =>
  saveState("user-cloze-matching-blank-states", payload);

export const fetchWritingExerciseStates = (exerciseId) =>
  fetchStateList("user-writing-exercise-states", { exercise: exerciseId });

export const saveWritingExerciseState = (payload) =>
  saveState("user-writing-exercise-states", payload);
