import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../client.js", () => ({ apiFetch }));
import { fetchAllFavoriteVocabularyCards, fetchVocabularyCards, setVocabularyCardFavorite, setVocabularyCardKnowledge } from "./vocabularyCards.js";

describe("vocabulary cards API", () => {
  beforeEach(() => apiFetch.mockReset());
  it("requests paginated vocabulary without an implicit collection", async () => {
    apiFetch.mockResolvedValue({ results: [] });
    await fetchVocabularyCards({ favorites: true, page: 3, search: "lernen" });
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/?favorites=true&page=3&search=lernen");
  });
  it("uses POST to favorite and DELETE to unfavorite", async () => {
    await setVocabularyCardFavorite(12, true);
    await setVocabularyCardFavorite(12, false);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/exam_preparation/vocabulary-cards/12/favorite/", { method: "POST" });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/exam_preparation/vocabulary-cards/12/favorite/", { method: "DELETE" });
  });

  it("loads every page of favorite cards", async () => {
    apiFetch.mockResolvedValueOnce({ next: "?page=2", results: [{ id: 1 }] }).mockResolvedValueOnce({ next: null, results: [{ id: 2 }] });
    await expect(fetchAllFavoriteVocabularyCards()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/exam_preparation/vocabulary-cards/?favorites=true&page=1");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/exam_preparation/vocabulary-cards/?favorites=true&page=2");
  });

  it("omits favorites for the ordinary all-cards listing", async () => {
    apiFetch.mockResolvedValue({ results: [] });
    await fetchVocabularyCards({ page: 1 });
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/?page=1");
  });

  it("loads favorites for an exact collection key", async () => {
    apiFetch.mockResolvedValue({ results: [] });
    await fetchVocabularyCards({ favorites: true, collectionKey: "video:42", page: 2 });
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/?collection_key=video%3A42&favorites=true&page=2");
  });

  it("loads every page for the requested collection", async () => {
    apiFetch.mockResolvedValue({ next: null, results: [] });
    await fetchAllFavoriteVocabularyCards({ collectionKey: "exam:TELC:B1" });
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/?collection_key=exam%3ATELC%3AB1&favorites=true&page=1");
  });

  it("loads all pages without an implicit collection and filters a prefix locally", async () => {
    apiFetch.mockResolvedValueOnce({ next: "?page=2", results: [{ id: 1, collection_key: "exam:TELC:B1" }] })
      .mockResolvedValueOnce({ next: null, results: [{ id: 2, collection_key: "video:42" }, { id: 3, collection_key: "exam:TELC:B2" }] });
    await expect(fetchAllFavoriteVocabularyCards({ collectionPrefix: "exam:" })).resolves.toEqual([
      { id: 1, collection_key: "exam:TELC:B1" }, { id: 3, collection_key: "exam:TELC:B2" },
    ]);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/exam_preparation/vocabulary-cards/?favorites=true&page=1");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/exam_preparation/vocabulary-cards/?favorites=true&page=2");
  });

  it("patches knowledge on a vocabulary card", async () => {
    await setVocabularyCardKnowledge(12, "KNOWN");
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/12/knowledge/", {
      method: "PATCH", body: { knowledge: "KNOWN" },
    });
  });
});
