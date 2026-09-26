import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ExamPreparationModulePage from "./ExamPreparationModulePage.jsx";
import { fetchSavedMockExams } from "../api/exam_preparation/mockExams.js";

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({
    user: {
      id: 7,
      entitlements: [{
        status: "active",
        module: { key: "exam_preparation" },
        starts_at: "2026-01-01T00:00:00Z",
        expires_at: "2027-01-01T00:00:00Z",
      }],
    },
  }),
}));
vi.mock("../api/exam_preparation/mockExams.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchSavedMockExams: vi.fn(), deleteSavedMockExam: vi.fn() };
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}{useLocation().search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/modules/exam-preparation"]}>
      <Routes>
        <Route path="*" element={<><ExamPreparationModulePage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("exam preparation mock exam entry", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fetchSavedMockExams.mockResolvedValue({
      count: 4,
      next: "/exam_preparation/saved-mock-exams/?scope=active&page=2&page_size=3",
      previous: null,
      results: [
        { id: 31, exam_type: "telc", level: "B1", progress: { phase: "writing" }, updated_at: "2026-09-26T10:00:00Z" },
        { id: 30, exam_type: "telc", level: "B1", progress: { phase: "listening" }, updated_at: "2026-09-25T10:00:00Z" },
        { id: 29, exam_type: "telc", level: "B1", progress: { phase: "reading" }, updated_at: "2026-09-24T10:00:00Z" },
      ],
    });
  });

  it("shows three unfinished exams and a link to the full history", async () => {
    renderPage();

    const unfinished = await screen.findByLabelText("未完成的模拟考试");
    expect(within(unfinished).getAllByRole("article")).toHaveLength(3);
    expect(within(unfinished).getByRole("link", { name: "查看更多未完成考试" })).toHaveAttribute(
      "href",
      "/modules/exam-preparation/mock-exams",
    );
    expect(fetchSavedMockExams).toHaveBeenCalledWith("active", 1, 3);
  });

  it("adds a continue button that opens the most recently updated attempt", async () => {
    renderPage();

    const entry = await screen.findByLabelText("笔试模拟考试");
    fireEvent.click(within(entry).getByRole("button", { name: "继续考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/modules/exam-preparation/mock-exam?attempt=31",
      );
    });
  });
});
