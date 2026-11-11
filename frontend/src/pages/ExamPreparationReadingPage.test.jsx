import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useExamPreparationStatistics } from "../hooks/useExamPreparationStatistics.js";
import ExamPreparationReadingPage from "./ExamPreparationReadingPage.jsx";

vi.mock("../hooks/useExamPreparationStatistics.js", () => ({
  useExamPreparationStatistics: vi.fn(),
}));

function renderPage(level) {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/lesen`]}>
      <Routes>
        <Route path="/modules/exam-preparation/:level/lesen" element={<ExamPreparationReadingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPreparationReadingPage counts", () => {
  it.each(["b1", "b2"])("maps the standard Teil counts for %s", (level) => {
    useExamPreparationStatistics.mockReturnValue({ [level.toUpperCase()]: { types: {
      READING_TITLE_MATCHING: 5, READING_UNDERSTANDING: 6, READING_AD_MATCHING: 7,
      CLOZE_MATCHING: 88,
    } } });

    renderPage(level);

    expect(screen.getByLabelText("5 道题目")).toBeInTheDocument();
    expect(screen.getByLabelText("6 道题目")).toBeInTheDocument();
    expect(screen.getByLabelText("7 道题目")).toBeInTheDocument();
  });

  it("uses the C1 cloze matching count for Teil 1", () => {
    useExamPreparationStatistics.mockReturnValue({ C1: { types: {
      CLOZE_MATCHING: 18, READING_UNDERSTANDING: 19, READING_AD_MATCHING: 20,
      READING_TITLE_MATCHING: 99,
    } } });

    renderPage("c1");

    expect(screen.getByLabelText("18 道题目")).toBeInTheDocument();
    expect(screen.getByLabelText("19 道题目")).toBeInTheDocument();
    expect(screen.getByLabelText("20 道题目")).toBeInTheDocument();
  });
});
