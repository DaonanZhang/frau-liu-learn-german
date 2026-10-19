import { apiFetch } from "../client";

const STORED_BREAK_PATTERN = /<br\s*\/?>/gi;
const STORED_CLOZE_BLANK_PATTERN = /\{\{\s*blank[\s_]*(\d+)\s*\}\}/gi;

export function normalizeExamPreparationContent(value) {
  if (typeof value === "string") {
    return value
      .replace(STORED_BREAK_PATTERN, "\n")
      .replace(STORED_CLOZE_BLANK_PATTERN, (_, number) => `{{blank_${number}}}`);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeExamPreparationContent);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        normalizeExamPreparationContent(nestedValue),
      ])
    );
  }
  return value;
}

export async function fetchExamPreparationContent(path, options) {
  const response = options === undefined
    ? await apiFetch(path)
    : await apiFetch(path, options);
  return normalizeExamPreparationContent(response);
}
