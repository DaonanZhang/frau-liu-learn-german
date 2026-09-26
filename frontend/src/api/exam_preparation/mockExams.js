import { apiFetch } from "../client";

const BASE = "/exam_preparation/mock-exams/";
const MOCK_EXAM_SESSION_KEY = "exam-preparation-written-mock-v1";
const ACTIVE_MOCK_EXAM_KEY = "exam-preparation-active-written-mock-id";

export function mockExamSessionKey(userId) {
  return `${MOCK_EXAM_SESSION_KEY}:${userId}`;
}

export function activeMockExamKey(userId) {
  return `${ACTIVE_MOCK_EXAM_KEY}:${userId}`;
}

export function clearMockExamLocalStorage() {
  for (const storage of [localStorage, sessionStorage]) {
    Object.keys(storage)
      .filter((key) => key === MOCK_EXAM_SESSION_KEY || key.startsWith(`${MOCK_EXAM_SESSION_KEY}:`))
      .forEach((key) => storage.removeItem(key));
  }
  Object.keys(localStorage)
    .filter((key) => key === ACTIVE_MOCK_EXAM_KEY || key.startsWith(`${ACTIVE_MOCK_EXAM_KEY}:`))
    .forEach((key) => localStorage.removeItem(key));
}

export function createMockExam(requestId) {
  return apiFetch(BASE, { method: "POST", body: { request_id: requestId } });
}

export function fetchSavedMockExams(scope = "favorites", page = 1, pageSize = 10) {
  const query = new URLSearchParams({ scope, page: String(page), page_size: String(pageSize) });
  return apiFetch(`/exam_preparation/saved-mock-exams/?${query.toString()}`);
}

export function fetchSavedMockExam(examId) {
  return apiFetch(`/exam_preparation/saved-mock-exams/${examId}/`);
}

export function saveMockExam(payload) {
  return apiFetch("/exam_preparation/saved-mock-exams/", { method: "POST", body: payload });
}

export function updateSavedMockExam(examId, payload) {
  return apiFetch(`/exam_preparation/saved-mock-exams/${examId}/`, { method: "PATCH", body: payload });
}

export function submitSavedMockExam(examId, payload) {
  return apiFetch(`/exam_preparation/saved-mock-exams/${examId}/submit/`, { method: "POST", body: payload });
}

export function deleteSavedMockExam(examId) {
  return apiFetch(`/exam_preparation/saved-mock-exams/${examId}/`, { method: "DELETE" });
}

export function retakeSavedMockExam(examId) {
  return apiFetch(`/exam_preparation/saved-mock-exams/${examId}/retake/`, { method: "POST", body: {} });
}
