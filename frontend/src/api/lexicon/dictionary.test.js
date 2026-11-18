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

  it("includes an optional collection key in lookups", () => {
    lookupDictionaryWord("gehen", "video:7");
    expect(apiFetch).toHaveBeenCalledWith(
      "/lexicon/dictionary/lookup/?word=gehen&collection_key=video%3A7",
      { method: "GET" },
    );
  });

  it("uses POST to favorite and DELETE to unfavorite", () => {
    setDictionaryFavorite(12, true);
    setDictionaryFavorite(12, false);
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/lexicon/dictionary/entries/12/favorite/", { method: "POST" });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/lexicon/dictionary/entries/12/favorite/", { method: "DELETE" });
  });

  it("sends collection context when favoriting and unfavoriting", () => {
    setDictionaryFavorite(12, true, "video:7");
    setDictionaryFavorite(12, false, "video:7");
    expect(apiFetch).toHaveBeenNthCalledWith(1, "/lexicon/dictionary/entries/12/favorite/", {
      method: "POST", body: { collection_key: "video:7" },
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/lexicon/dictionary/entries/12/favorite/", {
      method: "DELETE", body: { collection_key: "video:7" },
    });
  });
});
