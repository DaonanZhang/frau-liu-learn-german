import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import { fetchSavedMockExams, submitSavedMockExam } from "./mockExams.js";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));

describe("mock exam API", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("requests a specific page and page size for saved exams", () => {
    fetchSavedMockExams("active", 2, 3);

    expect(apiFetch).toHaveBeenCalledWith(
      "/exam_preparation/saved-mock-exams/?scope=active&page=2&page_size=3",
    );
  });

  it("submits an attempt through the dedicated submit action", () => {
    const payload = { answers: { "reading_understanding:1": "a" } };

    submitSavedMockExam(42, payload);

    expect(apiFetch).toHaveBeenCalledWith(
      "/exam_preparation/saved-mock-exams/42/submit/",
      { method: "POST", body: payload },
    );
  });
});
