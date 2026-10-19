import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import { fetchFavoriteQuestions } from "./favoriteQuestions.js";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));

describe("favorite questions API", () => {
  beforeEach(() => apiFetch.mockReset());

  it("serializes optional exam family and level without empty parameters", () => {
    fetchFavoriteQuestions({ examType: "TELC", level: "B2" });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/exam_preparation/favorite-questions/?exam_type=TELC&level=B2",
    );

    fetchFavoriteQuestions({ examType: "", level: "" });
    expect(apiFetch).toHaveBeenLastCalledWith("/exam_preparation/favorite-questions/");
  });

  it("serializes exam family and level independently", () => {
    fetchFavoriteQuestions({ examType: "TELC" });
    expect(apiFetch).toHaveBeenLastCalledWith("/exam_preparation/favorite-questions/?exam_type=TELC");

    fetchFavoriteQuestions({ level: "B1" });
    expect(apiFetch).toHaveBeenLastCalledWith("/exam_preparation/favorite-questions/?level=B1");
  });
});
