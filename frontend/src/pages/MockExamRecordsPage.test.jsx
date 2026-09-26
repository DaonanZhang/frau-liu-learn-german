import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MockExamRecordsPage from "./MockExamRecordsPage.jsx";
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
  return {
    ...actual,
    fetchSavedMockExams: vi.fn(),
    deleteSavedMockExam: vi.fn(),
    retakeSavedMockExam: vi.fn(),
    updateSavedMockExam: vi.fn(),
  };
});

function record(id) {
  return {
    id,
    exam_type: "telc",
    level: "B1",
    is_completed: false,
    is_favorite: false,
    progress: { phase: "reading" },
    updated_at: "2026-09-26T10:00:00Z",
  };
}

describe("mock exam records pagination", () => {
  beforeEach(() => {
    fetchSavedMockExams.mockImplementation((scope, page) => Promise.resolve({
      count: 12,
      next: page === 1 ? "next" : null,
      previous: page === 2 ? "previous" : null,
      results: page === 1 ? [record(12), record(11)] : [record(2), record(1)],
    }));
  });

  it("moves between history pages with previous and next buttons", async () => {
    render(<MemoryRouter><MockExamRecordsPage /></MemoryRouter>);

    expect(await screen.findByText("12 场")).toBeInTheDocument();
    expect(fetchSavedMockExams).toHaveBeenCalledWith("history", 1, 10);
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => expect(fetchSavedMockExams).toHaveBeenCalledWith("history", 2, 10));
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });
});
