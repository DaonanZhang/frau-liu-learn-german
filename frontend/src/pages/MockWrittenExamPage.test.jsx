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
        task_completion: "A",
        communicative_design: "A",
        formal_accuracy: "A",
      },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: 12,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));
  });

  it("keeps completed self-assessment actions outside the scrollable review content", async () => {
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const submit = await screen.findByRole("button", { name: "提交自评并结算" });
    const review = submit.closest(".mock-exam-writing-review");
    const scrollableContent = review.querySelector(".mock-exam-writing-review__body");

    expect(submit).toBeEnabled();
    expect(submit.parentElement).toHaveClass("mock-exam-writing-review__actions--sticky");
    expect(scrollableContent).toBeInTheDocument();
    expect(scrollableContent).not.toContainElement(submit);
    expect(screen.getByText("自评已完成，可以提交结算。")).toBeInTheDocument();
  });
});
