import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../api/auth/index.js";
import {
  fetchWritingExerciseDetail,
  } from "../api/exam_preparation/writingExercises.js";
import {
  fetchWritingExampleTextStates,
  fetchWritingExerciseStates,
  saveWritingExampleTextState,
  saveWritingExerciseState,
} from "../api/exam_preparation/userExerciseStates.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import ExamPreparationWritingDetailPage from "./ExamPreparationWritingDetailPage.jsx";

vi.mock("../api/auth/index.js", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api/auth/profile.js", () => ({
  updateMyProfile: vi.fn(),
}));

vi.mock("../api/exam_preparation/writingExercises.js", () => ({
  fetchWritingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchWritingExampleTextStates: vi.fn(),
  fetchWritingExerciseStates: vi.fn(),
  saveWritingExampleTextState: vi.fn(),
  saveWritingExerciseState: vi.fn(),
}));

function FakeHighlight(...ranges) {
  this.ranges = ranges;
}

function selectText(element, start, end) {
  const range = document.createRange();
  range.setStart(element.firstChild, start);
  range.setEnd(element.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("ExamPreparationWritingDetailPage text annotations", () => {
  const scope = exerciseAnnotationScope("WRITING", 41);

  beforeEach(() => {
    sessionStorage.clear();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    useAuth.mockReturnValue({
      user: { id: 7, has_seen_schreiben_guide: true },
      reloadMe: vi.fn(),
    });
    fetchWritingExerciseDetail.mockResolvedValue({
      id: 41,
      exercise_base: {
        external_id: "41",
        level: "B1",
        exam_type: "telc",
        exercise_type: "WRITING",
      },
      request_text: "Schreiben Sie eine E-Mail an Ihre Freundin.",
      task_text: "Entschuldigen Sie sich und nennen Sie einen Grund.",
      time_limit_minutes: 30,
      words_limit: 80,
      example_texts: [{
        id: 501,
        note: "Achten Sie auf die Anrede.",
        example_text: "Liebe Anna, leider kann ich nicht kommen.",
      }],
    });
    fetchWritingExerciseStates.mockResolvedValue({ results: [] });
    fetchWritingExampleTextStates.mockResolvedValue({ results: [] });
    saveWritingExampleTextState.mockResolvedValue({});
    saveWritingExerciseState.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.Highlight;
    delete window.CSS;
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/exercise/41"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ExamPreparationWritingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("registers the real writing scope and learning regions while excluding controls and draft input", async () => {
    renderPage();

    expect((await screen.findByText("Schreiben Sie eine E-Mail an Ihre Freundin.")).closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "task",
    );
    expect(screen.getByText("Entschuldigen Sie sich und nennen Sie einen Grund.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "prompt",
    );
    expect(screen.getByRole("link", { name: "← 返回写作模块" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByRole("textbox").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: /开始计时/ }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" }).closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("accepts draft input, preserves marks after Prüfen, and clears only this scope on Wiederholen", async () => {
    const unrelatedScope = exerciseAnnotationScope("READING", 9);
    sessionStorage.setItem(unrelatedScope, JSON.stringify({
      version: 1,
      regions: { passage: [{ start: 0, end: 4, highlight: true, underline: false }] },
    }));
    renderPage();

    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Liebe Anna" } });
    expect(textarea).toHaveValue("Liebe Anna");

    const prompt = screen.getByText("Entschuldigen Sie sich und nennen Sie einen Grund.");
    selectText(prompt, 0, 11);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions.prompt).toEqual([{
      start: 0,
      end: 11,
      highlight: true,
      underline: false,
    }]);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /开始计时/ }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /计时中：29:59/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions.prompt).toHaveLength(1);
    expect(screen.getByText("Achten Sie auf die Anrede.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "explanation:501",
    );
    expect(screen.getByText("Liebe Anna, leider kann ich nicht kommen.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "reference-answer:501",
    );
    expect(screen.getByRole("link", { name: "← 返回写作模块" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "收藏题目" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "收藏 Mustertext" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(document.querySelector(".writing-detail-actions__meta").closest("[data-exam-annotation-region]")).toBeNull();
    expect(document.querySelector(".writing-detail-review-card--user p").closest("[data-exam-annotation-region]")).toBeNull();
    const checkedTime = screen.getByRole("button", { name: /用时/ }).textContent;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("button", { name: /用时/ })).toHaveTextContent(checkedTime);

    const resetButton = screen.getByRole("button", { name: "Wiederholen" });
    expect(resetButton.closest("[data-exam-annotation-region]")).toBeNull();
    fireEvent.click(resetButton);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: /开始计时：30:00/ })).toBeInTheDocument();
    expect(sessionStorage.getItem(scope)).toBeNull();
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /开始计时：30:00/ }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /计时中：29:59/ })).toBeInTheDocument();
  });

  it("keeps the existing guide interactive without registering its controls", async () => {
    useAuth.mockReturnValue({
      user: { id: 7, has_seen_schreiben_guide: false },
      reloadMe: vi.fn(),
    });
    renderPage();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跳过引导" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "上一步" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "下一步" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("先阅读 Anleitung").closest("[data-exam-annotation-region]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("需要时开始计时")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一步" }).closest("[data-exam-annotation-region]")).toBeNull();
  });
});
