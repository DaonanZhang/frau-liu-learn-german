import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useExamPreparationStatistics } from "../hooks/useExamPreparationStatistics.js";
import ExamPreparationListeningPage from "./ExamPreparationListeningPage.jsx";

vi.mock("../hooks/useExamPreparationStatistics.js", () => ({
  useExamPreparationStatistics: vi.fn(),
}));

function renderPage(level) {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/hoeren`]}>
      <Routes>
        <Route path="/modules/exam-preparation/:level/hoeren" element={<ExamPreparationListeningPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPreparationListeningPage counts", () => {
  it.each(["b1", "b2", "c1"])("shows Teil counts for %s", (level) => {
    useExamPreparationStatistics.mockReturnValue({ [level.toUpperCase()]: { types: {
      LISTENING_TEIL1: 11, LISTENING_TEIL2: 22, LISTENING_TEIL3: 33,
    } } });

    renderPage(level);

    expect(screen.getByLabelText("11 道题目")).toBeInTheDocument();
    expect(screen.getByLabelText("22 道题目")).toBeInTheDocument();
    expect(screen.getByLabelText("33 道题目")).toBeInTheDocument();
  });

  it("hides counts while statistics are unavailable", () => {
    useExamPreparationStatistics.mockReturnValue(null);

    renderPage("b1");

    expect(screen.queryByLabelText(/道题目/)).not.toBeInTheDocument();
  });
});
