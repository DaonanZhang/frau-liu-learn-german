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

function renderPage(level = "b1") {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}`]}>
      <Routes>
        <Route path="/modules/exam-preparation/:level" element={<><ExamPreparationModulePage /><LocationProbe /></>} />
        <Route path="*" element={<LocationProbe />} />
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
      "/modules/exam-preparation/telc/b1/mock-exams",
    );
    expect(fetchSavedMockExams).toHaveBeenCalledWith("active", 1, 3, { examType: "TELC", level: "B1", levelPath: "b1" });
  });

  it("filters active records and displays their persisted scope on the B2 home", async () => {
    fetchSavedMockExams.mockResolvedValue({
      count: 1,
      results: [{ id: 35, exam_type: "telc", level: "B1", progress: { phase: "reading" }, updated_at: "2026-09-24T10:00:00Z" }],
    });
    renderPage("b2");

    const unfinished = await screen.findByLabelText("未完成的模拟考试");
    expect(fetchSavedMockExams).toHaveBeenCalledWith("active", 1, 3, { examType: "TELC", level: "B2", levelPath: "b2" });
    expect(within(unfinished).getByText(/TELC B1/)).toBeInTheDocument();
    fireEvent.click(within(unfinished).getByRole("button", { name: "继续考试" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam?attempt=35");
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
        "/modules/exam-preparation/telc/b1/mock-exam?attempt=31",
      );
    });
  });

  it("allows an entitled user to open mock exams regardless of release access", async () => {
    authMocks.useAuth.mockReturnValue({ user: entitledUser(false) });
    renderPage();

    const entry = screen.getByLabelText("笔试模拟考试");
    fireEvent.click(within(entry).getByRole("button", { name: "开始新考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam");
    });
    expect(fetchSavedMockExams).toHaveBeenCalledWith("active", 1, 3, { examType: "TELC", level: "B1", levelPath: "b1" });
  });

  it("clears only the abandoned active attempt annotations when starting a new exam", async () => {
    localStorage.setItem(activeMockExamKey(7), "31");
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: {} }));
    sessionStorage.setItem(mockAnnotationScope(32), JSON.stringify({ version: 1, regions: {} }));
    sessionStorage.setItem("exam-annotations:v1:exercise:other:1", JSON.stringify({ version: 1, regions: {} }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "开始新考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam");
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
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam?attempt=31");
    });
    expect(sessionStorage.getItem(mockAnnotationScope(31))).not.toBeNull();
  });

  it("keeps annotations when starting a new exam without an active attempt id", async () => {
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify({ version: 1, regions: {} }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "开始新考试" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b1/mock-exam");
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

  it("includes the active level in the checkout return path", () => {
    renderPage("b2");

    expect(screen.getByRole("link", { name: "延长有效期" })).toHaveAttribute(
      "href",
      "/modules/exam-preparation/purchase?return_to=%2Fmodules%2Fexam-preparation%2Fb2",
    );
  });

  it("keeps the active level when the locked mock exam opens checkout", async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 7, telephone: "13800138000", entitlements: [] } });
    Swal.fire.mockResolvedValue({ isConfirmed: true });
    renderPage("b2");

    fireEvent.click(screen.getByRole("button", { name: /购买以解锁/ }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(
      "/modules/exam-preparation/purchase?return_to=%2Fmodules%2Fexam-preparation%2Fb2",
    ));
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

describe("exam preparation level entry", () => {
  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({ user: entitledUser(true, "13800138000") });
    Swal.fire.mockReset();
  });

  it("keeps the TELC B2 level card as a normal link", () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation"]}>
        <Routes>
          <Route path="/modules/exam-preparation" element={<ExamPreparationModulePage />} />
          <Route path="/modules/exam-preparation/b2" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /TELC B2/ })).toHaveAttribute("href", "/modules/exam-preparation/b2");
    expect(Swal.fire).not.toHaveBeenCalled();
  });

  it("offers TELC B1, B2, and C1 as links to their level homes", () => {
    fetchSavedMockExams.mockClear();
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation"]}>
        <Routes><Route path="/modules/exam-preparation" element={<ExamPreparationModulePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /TELC B1/ })).toHaveAttribute("href", "/modules/exam-preparation/b1");
    expect(screen.getByRole("link", { name: /TELC B2/ })).toHaveAttribute("href", "/modules/exam-preparation/b2");
    expect(screen.getByRole("link", { name: /TELC C1/ })).toHaveAttribute("href", "/modules/exam-preparation/c1");
    expect(fetchSavedMockExams).not.toHaveBeenCalled();
  });

  it.each(["b1", "b2", "c1"])("shows the tips entry for %s", (level) => {
    renderPage(level);
    expect(screen.getByRole("link", { name: /Unsere Tipps/ })).toHaveAttribute("href", `/modules/exam-preparation/${level}/tips`);
  });

  it("keeps only tips linked on C1 and gives all five specialties Coming soon buttons", () => {
    fetchSavedMockExams.mockClear();
    renderPage("c1");
    expect(fetchSavedMockExams).not.toHaveBeenCalled();
    const skills = screen.getByRole("region", { name: "专项入口列表" });
    const tips = within(skills).getByRole("link", { name: /Unsere Tipps/ });
    expect(tips).toHaveAttribute("href", "/modules/exam-preparation/c1/tips");
    expect(within(skills).getAllByRole("link")).toHaveLength(1);
    const comingSoonButtons = within(skills).getAllByRole("button");
    expect(comingSoonButtons).toHaveLength(5);
    ["Hören", "Lesen", "Sprachbausteine", "Schreiben", "Sprechen"].forEach((name) => {
      expect(within(skills).getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    });
    comingSoonButtons.forEach((button) => {
      expect(within(button).getByText("Coming soon")).toBeInTheDocument();
      Swal.fire.mockClear();
      fireEvent.click(button);
      expect(Swal.fire).toHaveBeenCalledTimes(1);
      expect(Swal.fire).toHaveBeenCalledWith({ icon: "info", title: "Coming soon" });
    });
    const mockEntry = screen.getByLabelText("笔试模拟考试");
    fireEvent.click(within(mockEntry).getByRole("button", { name: "Coming soon" }));
    expect(Swal.fire).toHaveBeenCalledWith({ icon: "info", title: "Coming soon" });
  });

  it("keeps the active level on skill links in the reused level home", () => {
    renderPage("b2");
    expect(screen.getByRole("link", { name: "← 返回级别选择" })).toHaveAttribute(
      "href",
      "/modules/exam-preparation",
    );
    expect(screen.getByRole("link", { name: /进入听力模块/ })).toHaveAttribute(
      "href",
      "/modules/exam-preparation/b2/hoeren",
    );
    expect(screen.getByRole("heading", { name: "备考季 · B2" })).toBeInTheDocument();
  });

  it("describes the B2 speaking module as presentation training", () => {
    renderPage("b2");

    const speakingCard = screen.getByRole("link", { name: /进入 Sprechen/ });
    expect(within(speakingCard).getByText(
      "通过主题展示、主题讨论和共同策划三部分训练，在真实搭档任务中练习提问、表达观点、协商与达成一致。",
    )).toBeInTheDocument();
    expect(within(speakingCard).queryByText(/互相认识/)).not.toBeInTheDocument();
  });

  it("keeps the B1 speaking module description", () => {
    renderPage("b1");

    const speakingCard = screen.getByRole("link", { name: /进入 Sprechen/ });
    expect(within(speakingCard).getByText(
      "通过互相认识、主题讨论和共同策划三部分训练，在真实搭档任务中练习提问、表达观点、协商与达成一致。",
    )).toBeInTheDocument();
  });
});
