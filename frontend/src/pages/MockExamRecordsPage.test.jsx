import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MockExamRecordsPage from "./MockExamRecordsPage.jsx";
import { deleteSavedMockExam, fetchSavedMockExams } from "../api/exam_preparation/mockExams.js";
import { mockAnnotationScope } from "../utils/examTextAnnotations.js";
import Swal from "sweetalert2";

vi.mock("sweetalert2", () => ({ default: { fire: vi.fn() } }));

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
    localStorage.clear();
    sessionStorage.clear();
    Swal.fire.mockReset();
    deleteSavedMockExam.mockReset();
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

  it("clears only the deleted attempt annotations after a successful delete", async () => {
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, highlight: true }] } }));
    sessionStorage.setItem(mockAnnotationScope(32), JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, underline: true }] } }));
    sessionStorage.setItem("exam-annotations:v1:exercise:other:1", JSON.stringify({ version: 1, regions: {} }));
    deleteSavedMockExam.mockResolvedValue({});
    Swal.fire.mockResolvedValue({ isConfirmed: true });
    fetchSavedMockExams.mockResolvedValue({ count: 3, next: null, previous: null, results: [record(31), record(32)] });
    render(<MemoryRouter><MockExamRecordsPage /></MemoryRouter>);

    const records = await screen.findByText("3 场");
    expect(records).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() => expect(deleteSavedMockExam).toHaveBeenCalledWith(31));
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    expect(sessionStorage.getItem(mockAnnotationScope(32))).not.toBeNull();
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:other:1")).not.toBeNull();
  });

  it("keeps annotations when deleting an attempt fails", async () => {
    const annotation = JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, highlight: true }] } });
    sessionStorage.setItem(mockAnnotationScope(31), annotation);
    deleteSavedMockExam.mockRejectedValue(new Error("delete failed"));
    Swal.fire.mockResolvedValue({ isConfirmed: true });
    fetchSavedMockExams.mockResolvedValue({ count: 1, next: null, previous: null, results: [record(31)] });
    render(<MemoryRouter><MockExamRecordsPage /></MemoryRouter>);

    await screen.findByText("1 场");
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(deleteSavedMockExam).toHaveBeenCalledWith(31));
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBe(annotation);
  });

  it("keeps annotations and skips the API when deletion is cancelled", async () => {
    const annotation = JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, highlight: true }] } });
    sessionStorage.setItem(mockAnnotationScope(31), annotation);
    Swal.fire.mockResolvedValue({ isConfirmed: false });
    fetchSavedMockExams.mockResolvedValue({ count: 1, next: null, previous: null, results: [record(31)] });
    render(<MemoryRouter><MockExamRecordsPage /></MemoryRouter>);

    await screen.findByText("1 场");
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect(deleteSavedMockExam).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBe(annotation);
  });
});
