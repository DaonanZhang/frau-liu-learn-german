import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("../client.js", () => ({ apiFetch }));
import { fetchAllFavoriteVocabularyCards, fetchVocabularyCards, setVocabularyCardFavorite } from "./vocabularyCards.js";

describe("vocabulary cards API", () => {
  beforeEach(() => apiFetch.mockReset());
  it("requests paginated TELC C1 vocabulary with optional search", async () => {
    apiFetch.mockResolvedValue({ results: [] });
    await fetchVocabularyCards({ favorites: true, page: 3, search: "lernen" });
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/?exam_type=TELC&level=C1&favorites=true&page=3&search=lernen");
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
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/exam_preparation/vocabulary-cards/?exam_type=TELC&level=C1&favorites=true&page=1");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/exam_preparation/vocabulary-cards/?exam_type=TELC&level=C1&favorites=true&page=2");
  });

  it("omits favorites for the ordinary all-cards listing", async () => {
    apiFetch.mockResolvedValue({ results: [] });
    await fetchVocabularyCards({ page: 1 });
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/vocabulary-cards/?exam_type=TELC&level=C1&page=1");
  });
});
