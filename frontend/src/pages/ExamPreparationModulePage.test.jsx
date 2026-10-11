import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ExamPreparationModulePage from "./ExamPreparationModulePage.jsx";
import { EXAM_PREPARATION_MODULE } from "./Homepage/homeShared.js";
import {
  activeMockExamKey,
  deleteSavedMockExam,
  fetchSavedMockExams,
} from "../api/exam_preparation/mockExams.js";
import { mockAnnotationScope } from "../utils/examTextAnnotations.js";
import Swal from "sweetalert2";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../api/auth/useAuth.js", () => ({ useAuth: authMocks.useAuth }));
vi.mock("sweetalert2", () => ({ default: { fire: vi.fn() } }));

function entitledUser(releaseAccess = true, telephone = "13800138000") {
  return {
    id: 7,
    telephone,
    release_access: releaseAccess,
    entitlements: [{
      status: "active",
      module: { key: "exam_preparation" },
      starts_at: "2026-01-01T00:00:00Z",
      expires_at: "2027-01-01T00:00:00Z",
    }],
  };
}

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
    authMocks.useAuth.mockReturnValue({ user: entitledUser() });
    Swal.fire.mockReset();
    deleteSavedMockExam.mockReset();
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

  it("clears only the deleted attempt annotations after a successful delete", async () => {
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, highlight: true }] } }));
    sessionStorage.setItem(mockAnnotationScope(32), JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, underline: true }] } }));
    sessionStorage.setItem("exam-annotations:v1:exercise:other:1", JSON.stringify({ version: 1, regions: {} }));
    deleteSavedMockExam.mockResolvedValue({});
    Swal.fire.mockResolvedValue({ isConfirmed: true });
    renderPage();

    const unfinished = await screen.findByLabelText("未完成的模拟考试");
    fireEvent.click(within(unfinished).getAllByRole("button", { name: "删除" })[0]);

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
    renderPage();

    const unfinished = await screen.findByLabelText("未完成的模拟考试");
    fireEvent.click(within(unfinished).getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() => expect(deleteSavedMockExam).toHaveBeenCalledWith(31));
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBe(annotation);
  });

  it("keeps annotations and skips the API when deletion is cancelled", async () => {
    const annotation = JSON.stringify({ version: 1, regions: { question: [{ start: 0, end: 1, highlight: true }] } });
    sessionStorage.setItem(mockAnnotationScope(31), annotation);
    Swal.fire.mockResolvedValue({ isConfirmed: false });
    renderPage();

    const unfinished = await screen.findByLabelText("未完成的模拟考试");
    fireEvent.click(within(unfinished).getAllByRole("button", { name: "删除" })[0]);

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    expect(deleteSavedMockExam).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBe(annotation);
  });

  it("uses the same description as the homepage entry", () => {
    renderPage();

    expect(screen.getByText(EXAM_PREPARATION_MODULE.description)).toBeInTheDocument();
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

  it("allows an entitled user to open mock exams regardless of release access", async () => {
    authMocks.useAuth.mockReturnValue({ user: entitledUser(false) });
    renderPage();

    const entry = screen.getByLabelText("笔试模拟考试");
    fireEvent.click(within(entry).getByRole("button", { name: "开始新考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/mock-exam");
    });
    expect(fetchSavedMockExams).toHaveBeenCalledWith("active", 1, 3);
  });

  it("clears only the abandoned active attempt annotations when starting a new exam", async () => {
    localStorage.setItem(activeMockExamKey(7), "31");
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: {} }));
    sessionStorage.setItem(mockAnnotationScope(32), JSON.stringify({ version: 1, regions: {} }));
    sessionStorage.setItem("exam-annotations:v1:exercise:other:1", JSON.stringify({ version: 1, regions: {} }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "开始新考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/mock-exam");
    });
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    expect(sessionStorage.getItem(mockAnnotationScope(32))).not.toBeNull();
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:other:1")).not.toBeNull();
    expect(localStorage.getItem(activeMockExamKey(7))).toBeNull();
  });

  it("keeps active attempt annotations when continuing an exam", async () => {
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: {} }));
    renderPage();

    const entry = await screen.findByLabelText("笔试模拟考试");
    fireEvent.click(within(entry).getByRole("button", { name: "继续考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/mock-exam?attempt=31");
    });
    expect(sessionStorage.getItem(mockAnnotationScope(31))).not.toBeNull();
  });

  it("keeps annotations when starting a new exam without an active attempt id", async () => {
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: {} }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "开始新考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/mock-exam");
    });
    expect(sessionStorage.getItem(mockAnnotationScope(31))).not.toBeNull();
  });

  it("does not clear an active attempt when the mock exam is locked", async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 7, telephone: "13800138000", entitlements: [] } });
    const annotation = JSON.stringify({ version: 1, regions: {} });
    localStorage.setItem(activeMockExamKey(7), "31");
    sessionStorage.setItem(mockAnnotationScope(31), annotation);
    Swal.fire.mockResolvedValue({ isConfirmed: false });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /购买以解锁/ }));

    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBe(annotation);
    expect(localStorage.getItem(activeMockExamKey(7))).toBe("31");
  });

  it("shows the question-bank search only to telephone 110", () => {
    authMocks.useAuth.mockReturnValue({ user: entitledUser(true, "110") });
    const { unmount } = renderPage();

    expect(screen.getByRole("heading", { name: "题库搜索" })).toBeInTheDocument();
    unmount();

    authMocks.useAuth.mockReturnValue({
      user: {
        ...entitledUser(true, "119"),
        is_staff: true,
        is_superuser: true,
      },
    });
    renderPage();

    expect(screen.queryByRole("heading", { name: "题库搜索" })).not.toBeInTheDocument();
  });
});
