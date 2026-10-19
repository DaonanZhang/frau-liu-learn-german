import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MockExamPage from "./MockExamPage.jsx";

vi.mock("./telc/TelcMockExamPage.jsx", () => ({
  default: () => <div>TELC mock exam</div>,
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/modules/exam-preparation/:examType/:level/mock-exam" element={<MockExamPage />} />
        <Route path="/modules/exam-preparation" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MockExamPage", () => {
  it("renders the TELC implementation for the TELC route", () => {
    renderRoute("/modules/exam-preparation/telc/b2/mock-exam");
    expect(screen.getByText("TELC mock exam")).toBeInTheDocument();
  });

  it("does not render TELC for an unsupported exam family", () => {
    renderRoute("/modules/exam-preparation/goethe/b2/mock-exam");
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation");
    expect(screen.queryByText("TELC mock exam")).not.toBeInTheDocument();
  });
});
