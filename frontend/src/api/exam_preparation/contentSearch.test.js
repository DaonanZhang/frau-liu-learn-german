import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import { fetchExamPreparationContentSearch } from "./contentSearch.js";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));

describe("exam preparation content search API", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("encodes the query and selected filters", () => {
    fetchExamPreparationContentSearch({
      query: "Berlin & Wohnung",
      skill: "reading",
      teil: "2",
      page: 3,
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/exam_preparation/content-search/?q=Berlin+%26+Wohnung&skill=reading&teil=2&page=3",
    );
  });

  it("omits empty filters and defaults to the first page", () => {
    fetchExamPreparationContentSearch({ query: "Grillplatz" });

    expect(apiFetch).toHaveBeenCalledWith(
      "/exam_preparation/content-search/?q=Grillplatz&page=1",
    );
  });
});
