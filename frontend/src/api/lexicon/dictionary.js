import { apiFetch } from "../client.js";

export function lookupDictionaryWord(word) {
  const query = new URLSearchParams({ word }).toString();
  return apiFetch(`/lexicon/dictionary/lookup/?${query}`, { method: "GET" });
}

export function setDictionaryFavorite(entryId, favorite) {
  const method = favorite ? "POST" : "DELETE";
  return apiFetch(`/lexicon/dictionary/entries/${encodeURIComponent(entryId)}/favorite/`, { method });
}
