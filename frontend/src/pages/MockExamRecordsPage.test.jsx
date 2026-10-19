import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MockExamRecordsPage from "./MockExamRecordsPage.jsx";
import { deleteSavedMockExam, fetchSavedMockExams, retakeSavedMockExam } from "../api/exam_preparation/mockExams.js";
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe("mock exam records pagination", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Swal.fire.mockReset();
    deleteSavedMockExam.mockReset();
    retakeSavedMockExam.mockReset();
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
    expect(fetchSavedMockExams).toHaveBeenCalledWith("history", 1, 10, { examType: "TELC", level: "B1", levelPath: "b1" });
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => expect(fetchSavedMockExams).toHaveBeenCalledWith("history", 2, 10, { examType: "TELC", level: "B1", levelPath: "b1" }));
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });

  it("rejects an unsupported exam family without loading TELC records", async () => {
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/goethe/b2/mock-exams"]}><Routes>
      <Route path="/modules/exam-preparation/:examType/:level/mock-exams" element={<MockExamRecordsPage />} />
      <Route path="/modules/exam-preparation" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    expect(await screen.findByTestId("location")).toHaveTextContent("/modules/exam-preparation");
    expect(fetchSavedMockExams).not.toHaveBeenCalled();
  });

  it("requests only B2 records and keeps record navigation on the paper scope", async () => {
    fetchSavedMockExams.mockResolvedValue({ count: 1, next: null, previous: null, results: [record(22)] });
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exams"]}><Routes><Route path="/modules/exam-preparation/:examType/:level/mock-exams" element={<><MockExamRecordsPage /><LocationProbe /></>} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>);

    expect(await screen.findByText("1 场")).toBeInTheDocument();
    expect(fetchSavedMockExams).toHaveBeenCalledWith("history", 1, 10, { examType: "TELC", level: "B2", levelPath: "b2" });
    expect(screen.getByText("TELC B1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续考试" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam?attempt=22");
  });

  it("keeps the review link on a saved paper's persisted level", async () => {
    fetchSavedMockExams.mockResolvedValue({ count: 1, next: null, previous: null, results: [{
      ...record(44), exam_type: "telc", level: "B1", is_completed: true, is_favorite: true,
    }] });
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exams"]}><Routes>
      <Route path="/modules/exam-preparation/:examType/:level/mock-exams" element={<><MockExamRecordsPage /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    await screen.findByText("1 场");
    fireEvent.click(screen.getByRole("button", { name: "查看结果" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam?saved=44");
  });

  it("retakes a saved paper using its persisted level", async () => {
    fetchSavedMockExams.mockResolvedValue({ count: 1, next: null, previous: null, results: [{
      ...record(44), exam_type: "telc", level: "B1", is_completed: true, is_favorite: true,
    }] });
    retakeSavedMockExam.mockResolvedValue({ id: 45, exam_type: "TELC", level: "B1" });
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exams"]}><Routes>
      <Route path="/modules/exam-preparation/:examType/:level/mock-exams" element={<><MockExamRecordsPage /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    await screen.findByText("1 场");
    fireEvent.click(screen.getByRole("button", { name: "重考" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam?attempt=45"));
    expect(retakeSavedMockExam).toHaveBeenCalledWith(44);
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
