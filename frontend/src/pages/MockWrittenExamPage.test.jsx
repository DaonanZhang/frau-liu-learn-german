import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import MockWrittenExamPage from "./MockWrittenExamPage.jsx";
import mockExamStyles from "./MockWrittenExamPage.css?raw";

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
  let styleElement;

  beforeAll(() => {
    styleElement = document.createElement("style");
    styleElement.textContent = mockExamStyles;
    document.head.append(styleElement);
  });

  afterAll(() => styleElement.remove());

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

  it("shows only an enabled yellow submit button after completing self-assessment", async () => {
    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const submit = await waitFor(() => {
      const button = container.querySelector(".mock-exam-writing-review__actions button");
      expect(button).toBeInTheDocument();
      return button;
    });
    const review = submit.closest(".mock-exam-writing-review");
    const scrollableContent = review.querySelector(".mock-exam-writing-review__body");

    expect(submit).toBeEnabled();
    expect(submit.parentElement).toHaveClass("mock-exam-writing-review__actions--sticky");
    expect(scrollableContent).toBeInTheDocument();
    expect(scrollableContent).not.toContainElement(submit);
    expect(screen.queryByText("自评已完成，可以提交结算。")).not.toBeInTheDocument();
    expect(screen.queryByText("请完成上方所有自评项后提交")).not.toBeInTheDocument();
    expect(getComputedStyle(submit).backgroundColor).toBe("rgb(242, 189, 97)");
    expect(getComputedStyle(submit).color).toBe("rgb(44, 42, 34)");
  });

  it("shows a gray disabled submit button while self-assessment is incomplete", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
    snapshot.writingAssessment.formal_accuracy = "";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const submit = await waitFor(() => {
      const button = container.querySelector(".mock-exam-writing-review__actions button");
      expect(button).toBeInTheDocument();
      return button;
    });
    expect(submit).toBeDisabled();
    expect(getComputedStyle(submit).backgroundColor).toBe("rgb(216, 221, 218)");
    expect(getComputedStyle(submit).color).toBe("rgb(104, 117, 111)");
  });
});
