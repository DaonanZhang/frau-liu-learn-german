import { apiFetch } from "../client";
import { fetchExamPreparationContent } from "./contentText.js";

const BASE = "/exam_preparation/mock-exams/";
const MOCK_EXAM_SESSION_KEY = "exam-preparation-written-mock-v1";
const ACTIVE_MOCK_EXAM_KEY = "exam-preparation-active-written-mock-id";

export function mockExamSessionKey(userId, scope = { examType: "TELC", level: "B1" }) {
  return `${MOCK_EXAM_SESSION_KEY}:${scope.examType}:${scope.level}:${userId}`;
}

export function activeMockExamKey(userId, scope = { examType: "TELC", level: "B1" }) {
  return `${ACTIVE_MOCK_EXAM_KEY}:${scope.examType}:${scope.level}:${userId}`;
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

export function createMockExam(requestId, scope = { examType: "TELC", level: "B1" }) {
  return fetchExamPreparationContent(BASE, { method: "POST", body: { request_id: requestId, exam_type: scope.examType, level: scope.level } });
}

export function fetchSavedMockExams(scope = "favorites", page = 1, pageSize = 10, examScope) {
  const query = new URLSearchParams({ scope, page: String(page), page_size: String(pageSize) });
  if (examScope?.examType) query.set("exam_type", examScope.examType);
  if (examScope?.level) query.set("level", examScope.level);
  return apiFetch(`/exam_preparation/saved-mock-exams/?${query.toString()}`);
}

export function fetchSavedMockExam(examId) {
  return fetchExamPreparationContent(`/exam_preparation/saved-mock-exams/${examId}/`);
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
