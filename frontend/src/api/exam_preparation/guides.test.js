import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import {
  fetchGuideDetail,
  fetchGuides,
  guideMatchesLevel,
  setGuideLiked,
} from "./guides.js";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));

describe("exam preparation guide API", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("normalizes unpaginated and paginated guide lists", async () => {
    apiFetch.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await expect(fetchGuides()).resolves.toEqual({
      results: [{ id: 1 }, { id: 2 }],
      count: 2,
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/exam_preparation/guides/");

    apiFetch.mockResolvedValueOnce({ count: 8, next: null, results: [{ id: 8 }] });

    await expect(fetchGuides()).resolves.toEqual({
      count: 8,
      next: null,
      results: [{ id: 8 }],
    });
  });

  it("fetches a detail and toggles its like endpoint with the requested method", async () => {
    apiFetch.mockResolvedValue({ id: 7 });

    await fetchGuideDetail(7);
    await setGuideLiked(7, true);
    await setGuideLiked(7, false);

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/exam_preparation/guides/7/");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/exam_preparation/guides/7/like/", { method: "POST" });
    expect(apiFetch).toHaveBeenNthCalledWith(3, "/exam_preparation/guides/7/like/", { method: "DELETE" });
  });

  it("deduplicates concurrent detail requests so StrictMode records one view", async () => {
    let resolveDetail;
    apiFetch.mockReturnValueOnce(new Promise((resolve) => {
      resolveDetail = resolve;
    }));

    const firstRequest = fetchGuideDetail(12);
    const repeatedRequest = fetchGuideDetail(12);

    expect(repeatedRequest).toBe(firstRequest);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    resolveDetail({ id: 12, view_count: 1 });
    await firstRequest;

    apiFetch.mockResolvedValueOnce({ id: 12, view_count: 2 });
    await fetchGuideDetail(12);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["B1", { badges: ["TELC B1", "Lesen"] }, true],
    ["b1", { badges: ["TELC B2", "Lesen"], title: "Telc B1 Schreiben" }, true],
    ["B2", { badges: ["TELC B1"] }, false],
    ["B2", { badges: ["TELC B2"] }, true],
    ["C1", { badges: ["TELC C1 HS"] }, true],
    ["c1", { title: "Telc C1 HS Lesen Teil 3" }, true],
    ["C1", { badges: [] }, false],
  ])("matches %s guides without confusing neighboring levels", (level, guide, expected) => {
    expect(guideMatchesLevel(guide, level)).toBe(expected);
  });
});
