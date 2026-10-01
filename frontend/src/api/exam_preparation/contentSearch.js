import { apiFetch } from "../client";

export function fetchExamPreparationContentSearch({
  query,
  skill = "",
  teil = "",
  page = 1,
}) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (skill) params.set("skill", skill);
  if (teil) params.set("teil", teil);
  params.set("page", String(page));
  return apiFetch(`/exam_preparation/content-search/?${params.toString()}`);
}
