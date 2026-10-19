import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import { activeMockExamKey, createMockExam, fetchSavedMockExams, mockExamSessionKey, submitSavedMockExam } from "./mockExams.js";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));

describe("mock exam API", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("requests a specific page and page size for saved exams", () => {
    fetchSavedMockExams("active", 2, 3, { examType: "TELC", level: "B2" });

    expect(apiFetch).toHaveBeenCalledWith(
      "/exam_preparation/saved-mock-exams/?scope=active&page=2&page_size=3&exam_type=TELC&level=B2",
    );
  });

  it("creates a mock exam with the request id and active scope", () => {
    createMockExam("request-123", { examType: "TELC", level: "B2" });

    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/mock-exams/", {
      method: "POST",
      body: { request_id: "request-123", exam_type: "TELC", level: "B2" },
    });
  });

  it("isolates session and active attempt keys by user, family, and level", () => {
    expect(mockExamSessionKey(7, { examType: "TELC", level: "B1" }))
      .not.toBe(mockExamSessionKey(7, { examType: "TELC", level: "B2" }));
    expect(activeMockExamKey(7, { examType: "TELC", level: "B1" }))
      .not.toBe(activeMockExamKey(7, { examType: "TELC", level: "B2" }));
    expect(mockExamSessionKey(7, { examType: "TELC", level: "B2" })).toContain("TELC:B2:7");
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
