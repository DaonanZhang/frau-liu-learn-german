import { apiFetch } from "../client.js";

export function fetchExamPreparationStatistics() {
  return apiFetch("/exam_preparation/statistics/");
}
