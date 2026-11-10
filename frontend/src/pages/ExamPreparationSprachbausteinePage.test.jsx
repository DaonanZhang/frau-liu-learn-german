import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ExamPreparationSprachbausteinePage from "./ExamPreparationSprachbausteinePage.jsx";

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderPage(level) {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/sprachbausteine`]}>
      <Routes>
        <Route
          path="/modules/exam-preparation/:level/sprachbausteine"
          element={<><ExamPreparationSprachbausteinePage /><LocationProbe /></>}
        />
        <Route
          path="/modules/exam-preparation/:level/sprachbausteine/cloze-choice"
          element={<><p>题目列表</p><LocationProbe /></>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPreparationSprachbausteinePage", () => {
  it("sends C1 directly to its only exercise list", async () => {
    renderPage("c1");

    expect(await screen.findByText("题目列表")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/modules/exam-preparation/c1/sprachbausteine/cloze-choice",
    );
    expect(screen.queryByRole("heading", { name: "Teil 1" })).not.toBeInTheDocument();
  });

  it("keeps the B1 part selection page", () => {
    renderPage("b1");

    expect(screen.getByRole("heading", { name: "Teil 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teil 2" })).toBeInTheDocument();
  });
});
