import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchReadingUnderstandingExerciseDetail } from "../api/exam_preparation/readingUnderstanding.js";
import { fetchReadingUnderstandingQuestionStates } from "../api/exam_preparation/userExerciseStates.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import ReadingUnderstandingPage from "./ReadingUnderstandingPage.jsx";

vi.mock("../api/exam_preparation/readingUnderstanding.js", () => ({
  fetchReadingUnderstandingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchReadingUnderstandingQuestionStates: vi.fn(),
  saveReadingUnderstandingQuestionState: vi.fn(),
}));

describe("reading understanding annotations", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchReadingUnderstandingExerciseDetail.mockResolvedValue({
      id: 27,
      exercise_base: {
        external_id: "27",
        level: "B1",
        exam_type: "telc",
        exercise_type: "READING_UNDERSTANDING",
      },
      text_markdown: "Passage content",
      questions: [{
        id: 201,
        question_number: 1,
        question_text: "Question text",
        explanation: "Explain this",
        answer_options: [
          { id: 301, option_key: "a", option_text: "First option", is_correct: true },
          { id: 302, option_key: "b", option_text: "Second option", is_correct: false },
        ],
      }],
    });
    fetchReadingUnderstandingQuestionStates.mockResolvedValue({ results: [] });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/exercise/27"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ReadingUnderstandingPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("registers scoped passage, question, option, and control-excluded regions", async () => {
    renderPage();

    expect((await screen.findByText("Passage content")).closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "passage",
      );
    expect(screen.getByText(/Question text/)).toHaveAttribute(
      "data-exam-annotation-region",
      "question:201",
    );
    expect(screen.getByText("First option")).toHaveAttribute(
      "data-exam-annotation-region",
      "option:201:301",
    );
    expect(screen.getByText("Second option")).toHaveAttribute(
      "data-exam-annotation-region",
      "option:201:302",
    );
    expect(screen.getByText("Lesen Sie den Text und die Aufgaben. Welche Lösung (a, b oder c) ist jeweils richtig?")).toHaveAttribute(
      "data-exam-annotation-region",
      "task",
    );
    expect(screen.getByRole("link", { name: "← Zurück zu Lesen" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByRole("button", { name: "Prüfen" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByText("telc", { selector: ".reading-understanding-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("难度：B1", { selector: ".reading-understanding-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("keeps the annotation key after checking, reveals the correct option, and clears only its scope on Wiederholen", async () => {
    const scope = exerciseAnnotationScope("READING_UNDERSTANDING", 27);
    const unrelatedScope = exerciseAnnotationScope("READING_TITLE_MATCHING", 17);
    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: { passage: [{ start: 0, end: 7, highlight: true, underline: false }] },
    }));
    sessionStorage.setItem(unrelatedScope, JSON.stringify({
      version: 1,
      regions: { item: [{ start: 0, end: 1, highlight: true, underline: false }] },
    }));
    renderPage();

    fireEvent.click(await screen.findByDisplayValue("b"));
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(sessionStorage.getItem(scope)).toContain("passage");
    expect(screen.getByText("First option")).toHaveClass("reading-understanding-option__text");
    expect(screen.getByText("First option").closest(".reading-understanding-option"))
      .toHaveClass("reading-understanding-option--correct");
    expect(screen.getByText("Explain this").closest(
      '[data-exam-annotation-region="explanation:201"]',
    )).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Zurück zu Lesen" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "Wiederholen" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "收藏题目" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByText("Falsch").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("telc", { selector: ".reading-understanding-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("难度：B1", { selector: ".reading-understanding-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
    expect(screen.getByDisplayValue("b")).not.toBeChecked();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
  });
});
