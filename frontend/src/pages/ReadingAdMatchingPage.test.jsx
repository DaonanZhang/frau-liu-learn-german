import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReadingAdMatchingPage from "./ReadingAdMatchingPage.jsx";

import { fetchReadingAdMatchingExerciseDetail } from "../api/exam_preparation/readingAdMatching.js";
import {
  fetchReadingAdMatchingItemStates,
  saveReadingAdMatchingItemState,
} from "../api/exam_preparation/userExerciseStates.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";

vi.mock("../api/exam_preparation/readingAdMatching.js", () => ({
  fetchReadingAdMatchingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchReadingAdMatchingItemStates: vi.fn(),
  saveReadingAdMatchingItemState: vi.fn(),
}));

const detail = {
  id: 77,
  exercise_base: {
    exercise_type: "READING_AD_MATCHING",
    level: "B1",
    external_id: "ad-77",
    exam_type: "telc",
  },
  instruction: "Lesen Sie die Situationen.",
  ads: [
    { id: 11, ad_key: "a", ad_text_markdown: "Anzeige A\nText A" },
    { id: 12, ad_key: "b", ad_text_markdown: "Anzeige B\nText B" },
  ],
  items: [{
    id: 21,
    item_number: 1,
    item_text: "Situation eins",
    correct_ad: { ad_key: "a" },
    explanation: "Erklärung eins",
  }],
};

function FakeHighlight(...ranges) {
  this.ranges = ranges;
}

function selectText(element, start, end) {
  const range = document.createRange();
  range.setStart(element.firstChild, start);
  range.setEnd(element.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/reading/ad/77"]}>
      <Routes>
        <Route path="/reading/ad/:exerciseId" element={<ReadingAdMatchingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReadingAdMatchingPage annotations", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    fetchReadingAdMatchingExerciseDetail.mockResolvedValue(detail);
    fetchReadingAdMatchingItemStates.mockResolvedValue({ results: [] });
    saveReadingAdMatchingItemState.mockResolvedValue({});
  });

  afterEach(() => {
    document.body.replaceChildren();
    delete window.Highlight;
    delete window.CSS;
  });

  it("mounts one exercise-scoped provider and excludes application controls", async () => {
    renderPage();
    await screen.findByText("Lesen Sie die Situationen.");

    expect(document.querySelector('[data-exam-annotation-region="task"]')).toHaveTextContent("Lesen Sie");
    expect(document.querySelector('[data-exam-annotation-region="ad:11"]')).toBeInTheDocument();
    expect(document.querySelector('[data-exam-annotation-region="item:21"]')).toHaveTextContent("Situation eins");
    expect(document.querySelector('[data-exam-annotation-region="option:21:11"]')).toHaveTextContent("A");
    expect(screen.getByRole("link", { name: /Zurück zu Lesen/ }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("telc").closest("[data-exam-annotation-region]")).toBeNull();

    const scope = exerciseAnnotationScope(detail.exercise_base.exercise_type, detail.id);
    expect(scope).toBe("exam-annotations:v1:exercise:READING_AD_MATCHING:77");
  });

  it("creates a mark in the current scope, preserves it through checking, and clears only it on Wiederholen", async () => {
    renderPage();
    await screen.findByText("Lesen Sie die Situationen.");

    const task = document.querySelector('[data-exam-annotation-region="task"]');
    selectText(task, 0, 5);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));

    const scope = exerciseAnnotationScope(detail.exercise_base.exercise_type, detail.id);
    const markedState = JSON.parse(sessionStorage.getItem(scope));
    expect(markedState.regions.task).toEqual([{ start: 0, end: 5, highlight: true, underline: false }]);

    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(await screen.findByText(/Erklärung:/)).toBeInTheDocument();
    expect(document.querySelector('[data-exam-annotation-region="explanation:21"]')).toHaveTextContent("Erklärung eins");
    expect(JSON.parse(sessionStorage.getItem(scope)).regions.task).toEqual(markedState.regions.task);
    expect(screen.getByText("Richtig").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "收藏题目" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "Wiederholen" }).closest("[data-exam-annotation-region]")).toBeNull();

    const unrelatedScope = "exam-annotations:v1:exercise:READING_UNDERSTANDING:88";
    sessionStorage.setItem(unrelatedScope, JSON.stringify({ version: 1, regions: {} }));
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
    expect(screen.queryByText(/Erklärung:/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")[0]).not.toBeChecked();
  });
});
