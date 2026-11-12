import { apiFetch } from "../client.js";
import { fetchExamPreparationContent } from "./contentText.js";

const BASE = "/exam_preparation/vocabulary-cards/";

export function fetchVocabularyCards({ favorites, page = 1, search = "" } = {}) {
  const params = new URLSearchParams({ exam_type: "TELC", level: "C1" });
  if (typeof favorites === "boolean") params.set("favorites", String(favorites));
  params.set("page", String(page));
  if (search.trim()) params.set("search", search.trim());
  return fetchExamPreparationContent(`${BASE}?${params}`);
}

export async function fetchAllFavoriteVocabularyCards() {
  const results = [];
  let page = 1;
  let next = true;
  while (next) {
    const data = await fetchVocabularyCards({ favorites: true, page });
    results.push(...(Array.isArray(data) ? data : data?.results || []));
    next = !Array.isArray(data) && Boolean(data?.next);
    page += 1;
  }
  return results;
}

export function setVocabularyCardFavorite(id, isFavorite) {
  return apiFetch(`${BASE}${encodeURIComponent(id)}/favorite/`, { method: isFavorite ? "POST" : "DELETE" });
}
