import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../client.js", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../client.js";
import { lookupDictionaryWord, setDictionaryFavorite } from "./dictionary.js";

describe("dictionary API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("encodes lookup words and uses GET", () => {
    lookupDictionaryWord("Häusern & E-Mail");
    expect(apiFetch).toHaveBeenCalledWith("/lexicon/dictionary/lookup/?word=H%C3%A4usern+%26+E-Mail", { method: "GET" });
  });

  it("uses POST to favorite and DELETE to unfavorite", () => {
    setDictionaryFavorite(12, true);
    setDictionaryFavorite(12, false);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/lexicon/dictionary/entries/12/favorite/", { method: "POST" });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/lexicon/dictionary/entries/12/favorite/", { method: "DELETE" });
  });
});
