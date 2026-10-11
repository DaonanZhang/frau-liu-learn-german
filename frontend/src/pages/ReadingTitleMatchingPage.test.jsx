import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchReadingTitleMatchingExerciseDetail } from "../api/exam_preparation/readingTitleMatching.js";
import { fetchReadingTitleMatchingItemStates } from "../api/exam_preparation/userExerciseStates.js";
import ReadingTitleMatchingPage from "./ReadingTitleMatchingPage.jsx";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";

const readingTitleStyles = readFileSync(resolve("src/pages/ReadingTitleMatchingPage.css"), "utf8");

vi.mock("../api/exam_preparation/readingTitleMatching.js", () => ({
  fetchReadingTitleMatchingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchReadingTitleMatchingItemStates: vi.fn(),
  saveReadingTitleMatchingItemState: vi.fn(),
}));

describe("reading title matching options", () => {
  beforeEach(() => {
    fetchReadingTitleMatchingExerciseDetail.mockResolvedValue({
      id: 17,
      exercise_base: {
        external_id: "17",
        level: "B1",
        exam_type: "telc",
        exercise_type: "READING_TITLE_MATCHING",
      },
      instruction: "Ordnen Sie die Überschriften zu.",
      options: [
        { id: 1, option_key: "A", option_text: "Erster Titel" },
        { id: 2, option_key: "B", option_text: "Zweiter Titel" },
      ],
      items: [{
        id: 101,
        item_number: 1,
        text: "Lesetext",
        correct_option: { id: 1, option_key: "A", option_text: "Erster Titel" },
        explanation: "Text explanation",
      }],
    });
    fetchReadingTitleMatchingItemStates.mockResolvedValue({ results: [] });
  });

  it("keeps the unanswered title picker shorter than the full text row", () => {
    expect(readingTitleStyles).toMatch(/\.reading-title-inline-answer--inline\s*\{[^}]*width:\s*max-content/);
    expect(readingTitleStyles).toMatch(/\.reading-title-select\s*\{[^}]*width:\s*auto/);
    expect(readingTitleStyles).toMatch(/\.reading-title-inline-answer--empty\s*\{[^}]*width:\s*max-content/);
    expect(readingTitleStyles).toMatch(/\.reading-title-select-trigger--empty\s*\{[^}]*width:\s*auto/);
  });

  it("shows each option letter before its title", async () => {
    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ReadingTitleMatchingPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Überschrift zu Text 1" }));

    const firstOption = await screen.findByRole("button", { name: "A Erster Titel" });
    expect(screen.getByRole("button", { name: "B Zweiter Titel" })).toBeInTheDocument();
    expect(screen.getByText("Erster Titel", {
      selector: '[data-exam-annotation-region="option:101:1"]',
    })).toBeInTheDocument();
    expect(screen.getByText("Zweiter Titel", {
      selector: '[data-exam-annotation-region="option:101:2"]',
    })).toBeInTheDocument();
    fireEvent.click(firstOption);

    const selectedAnswer = screen.getByRole("button", { name: "Überschrift zu Text 1" });
    expect(within(selectedAnswer).getByText("A")).toHaveClass("reading-title-select__key");
    expect(within(selectedAnswer).getByText("Erster Titel")).toHaveClass("reading-title-select__label");
  });

  it("registers scoped learning regions and keeps controls outside them", async () => {
    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ReadingTitleMatchingPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Lesetext")).toHaveAttribute(
      "data-exam-annotation-region",
      "item:101",
    );
    expect(screen.getByText("Ordnen Sie die Überschriften zu.")).toHaveAttribute(
      "data-exam-annotation-region",
      "task",
    );
    expect(screen.getByRole("link", { name: "← Zurück zu Lesen" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByRole("button", { name: "Prüfen" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByText("telc", { selector: ".reading-title-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("难度：B1", { selector: ".reading-title-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("preserves annotations on check, clears only its scope on Wiederholen, and keeps option clicks working", async () => {
    const scope = exerciseAnnotationScope("READING_TITLE_MATCHING", 17);
    const unrelatedScope = exerciseAnnotationScope("READING_UNDERSTANDING", 27);
    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: { "item:101": [{ start: 0, end: 3, highlight: true, underline: false }] },
    }));
    sessionStorage.setItem(unrelatedScope, JSON.stringify({
      version: 1,
      regions: { passage: [{ start: 0, end: 3, highlight: true, underline: false }] },
    }));

    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ReadingTitleMatchingPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Überschrift zu Text 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "B Zweiter Titel" }));
    expect(screen.getByRole("button", { name: "Überschrift zu Text 1" })).toHaveTextContent("Zweiter Titel");

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(sessionStorage.getItem(scope)).toContain("item:101");
    expect(screen.getByText("Text explanation").closest(
      '[data-exam-annotation-region="explanation:101"]',
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
    expect(screen.getByText("telc", { selector: ".reading-title-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("难度：B1", { selector: ".reading-title-hero__badge" })
      .closest("[data-exam-annotation-region]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    expect(sessionStorage.getItem(scope)).toBeNull();
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Überschrift zu Text 1" })).toHaveTextContent("Überschrift auswählen");
  });
});
