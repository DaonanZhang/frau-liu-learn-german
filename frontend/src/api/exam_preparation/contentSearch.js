import { fetchExamPreparationContent } from "./contentText.js";

export function fetchExamPreparationContentSearch({
  query,
  skill = "",
  teil = "",
  page = 1,
  scope,
}) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (skill) params.set("skill", skill);
  if (teil) params.set("teil", teil);
  params.set("page", String(page));
  if (scope?.examType) params.set("exam_type", scope.examType);
  if (scope?.level) params.set("level", scope.level);
  return fetchExamPreparationContent(`/exam_preparation/content-search/?${params.toString()}`);
}
