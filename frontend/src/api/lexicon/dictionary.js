import { apiFetch } from "../client.js";

export function lookupDictionaryWord(word, collectionKey) {
  const params = new URLSearchParams({ word });
  if (collectionKey) params.set("collection_key", collectionKey);
  const query = params.toString();
  return apiFetch(`/lexicon/dictionary/lookup/?${query}`, { method: "GET" });
}

export function setDictionaryFavorite(entryId, favorite, collectionKey) {
  const method = favorite ? "POST" : "DELETE";
  return apiFetch(`/lexicon/dictionary/entries/${encodeURIComponent(entryId)}/favorite/`, {
    method,
    ...(collectionKey ? { body: { collection_key: collectionKey } } : {}),
  });
}
