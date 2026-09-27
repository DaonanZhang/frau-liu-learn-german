import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MockWrittenExamPage from "./MockWrittenExamPage.jsx";

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));

vi.mock("../api/exam_preparation/mockExams.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createMockExam: vi.fn(),
    fetchSavedMockExam: vi.fn(),
    saveMockExam: vi.fn(),
    submitSavedMockExam: vi.fn(),
    updateSavedMockExam: vi.fn(),
  };
});

describe("writing self-assessment", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
      exam: { parts: { writing: { example_texts: [] } } },
      phase: "writing_review",
      deadline: 0,
      activePart: "writing",
      answers: {},
      writingText: "Meine Antwort",
      writingAssessment: {
        topic_relevant: true,
        task_completion: "",
        communicative_design: "",
        formal_accuracy: "",
      },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: 12,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));
  });

  it("keeps the self-assessment submit action visible after reopening the review", async () => {
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const submit = await screen.findByRole("button", { name: "提交自评并结算" });
    expect(submit).toBeDisabled();
    expect(submit.parentElement).toHaveClass("mock-exam-writing-review__actions--fixed");
    expect(screen.getByText("请完成上方所有自评项后提交")).toBeInTheDocument();
  });
});
