import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSpeakingTeilExerciseDetail } from "../api/exam_preparation/speakingExercises.js";
import {
  fetchSpeakingTurnStates,
  saveSpeakingTurnState,
} from "../api/exam_preparation/userExerciseStates.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import SpeakingTeilExercisePage from "./SpeakingTeilExercisePage.jsx";

vi.mock("../api/exam_preparation/speakingExercises.js", () => ({
  fetchSpeakingTeilExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchSpeakingTurnStates: vi.fn(),
  saveSpeakingTurnState: vi.fn(),
}));

vi.mock("../components/examPreparation/SpeakingPracticeRecorder.jsx", () => ({
  default: ({ recordingId }) => <button type="button" aria-label={`record ${recordingId}`}>record</button>,
}));

vi.mock("../components/examPreparation/ExerciseFavoriteButton.jsx", () => ({
  default: ({ onClick }) => <button type="button" aria-label="收藏句子" onClick={onClick}>favorite</button>,
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

const teil3Exercise = {
  id: 44,
  exercise_base: {
    level: "B1",
    title: "Gemeinsam planen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL3",
  },
  instruction: "Ordnen Sie den Dialog.",
  content: {
    task: "Planen Sie gemeinsam einen Ausflug.",
    sections: [{
      id: "trip",
      type: "Ausflug",
      turns: [
        { id: "first", sequence: 1, role: "TN1", text: "Wann treffen wir uns?" },
        { id: "second", sequence: 2, role: "TN2", text: "Am Samstag um zehn Uhr." },
      ],
    }],
  },
};

const teil2Exercise = {
  id: 45,
  exercise_base: {
    level: "B1",
    title: "Über ein Thema sprechen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL2",
  },
  instruction: "Ordnen Sie die Gesprächsteile.",
  content: {
    task: "Sprechen Sie über das Thema Urlaub.",
    cards: [{ id: "anna", participant: "Anna", title: "Urlaub", content: "Ich fahre gern ans Meer." }],
    dialogue: [
      { id: "first", sequence: 1, role: "TN1", text: "Was möchtest du im Urlaub machen?" },
      { id: "second", sequence: 2, role: "TN2", text: "Ich möchte wandern." },
    ],
  },
};

const teil3MultiSectionExercise = {
  id: 46,
  exercise_base: {
    level: "B1",
    title: "Mehrere Gespräche planen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL3",
  },
  instruction: "Ordnen Sie die Gespräche.",
  content: {
    task: "Planen Sie zwei Termine.",
    sections: [
      {
        id: "first-section",
        type: "Erster Termin",
        turns: [
          { id: "first-a", sequence: 1, role: "TN1", text: "Wann treffen wir uns?" },
          { id: "first-b", sequence: 2, role: "TN2", text: "Am Montag." },
        ],
      },
      {
        id: "second-section",
        type: "Zweiter Termin",
        turns: [
          { id: "second-a", sequence: 1, role: "TN1", text: "Wo treffen wir uns?" },
          { id: "second-b", sequence: 2, role: "TN2", text: "Am Bahnhof." },
        ],
      },
    ],
  },
};

describe("SpeakingTeilExercisePage text annotations", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() });
    fetchSpeakingTurnStates.mockResolvedValue({ results: [] });
    saveSpeakingTurnState.mockResolvedValue({});
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete window.Highlight;
    delete window.CSS;
  });

  function renderPage(teil, exerciseId) {
    return render(
      <MemoryRouter initialEntries={[`/exercise/${exerciseId}`]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<SpeakingTeilExercisePage teil={teil} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("uses the real speaking scope, registers learning content, and excludes controls", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil3Exercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{
      turn_key: "dialogue-order:section:0",
      answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
    }] });
    renderPage(3, 44);

    expect((await screen.findByText("Ordnen Sie den Dialog.")).closest("[data-exam-annotation-region]"))
      .toHaveAttribute("data-exam-annotation-region", "task");
    expect(screen.getByText("Planen Sie gemeinsam einen Ausflug.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute("data-exam-annotation-region", "material:task");
    expect(screen.getByText("Ausflug", { selector: '[data-exam-annotation-region="section:trip"]' }))
      .toHaveAttribute("data-exam-annotation-region", "section:trip");
    expect(screen.getByText("Wann treffen wir uns?", { selector: '[data-exam-annotation-region="turn:first"]' }))
      .toHaveAttribute("data-exam-annotation-region", "turn:first");

    expect(screen.getByRole("link", { name: /Zurück zu Sprechen/ }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getAllByRole("button", { name: "Weiter →" })[0].closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "record teil-3-44-0-1" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
  });

  it("keeps marks after Prüfen and clears only this exercise on Wiederholen", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL2", 45);
    const unrelatedScope = exerciseAnnotationScope("SPEAKING_TEIL3", 44);
    sessionStorage.setItem(unrelatedScope, JSON.stringify({
      version: 1,
      regions: { task: [{ start: 0, end: 4, highlight: true, underline: false }] },
    }));
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil2Exercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{
      turn_key: "dialogue-order:all",
      answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: false },
    }] });
    renderPage(2, 45);

    const task = await screen.findByText("Sprechen Sie über das Thema Urlaub.");
    selectText(task, 0, 8);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["material:task"]).toEqual([{
      start: 0,
      end: 8,
      highlight: true,
      underline: false,
    }]);

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["material:task"]).toHaveLength(1);
    expect(screen.getByText("Was möchtest du im Urlaub machen?", { selector: '[data-exam-annotation-region="explanation:first"]' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" })).toBeInTheDocument();
  });

  it("keeps section ordering actions intact and reveals annotated complete dialogue", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL3", 44);
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil3Exercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{
      turn_key: "dialogue-order:section:0",
      answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
    }] });
    renderPage(3, 44);

    const allDialogues = await screen.findAllByText("Wann treffen wir uns?");
    expect(allDialogues.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "展示全部完整对话" }));
    expect(screen.getByText("Wann treffen wir uns?", { selector: '[data-exam-annotation-region="explanation:full:first"]' }))
      .toBeInTheDocument();

    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: { "turn:first": [{ start: 0, end: 4, underline: true, highlight: false }] },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
  });

  it("keeps card text selectable while handles preserve touch/desktop ordering and real saves", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL2", 45);
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil2Exercise);
    renderPage(2, 45);

    const firstText = await screen.findByText("Was möchtest du im Urlaub machen?");
    const firstCard = firstText.closest("article");
    const firstHandle = firstCard.querySelector("[data-speaking-drag-handle]");
    expect(firstCard).not.toHaveAttribute("draggable");
    expect(firstHandle).toHaveAttribute("draggable", "true");
    expect(getComputedStyle(firstHandle).touchAction).toBe("none");
    expect(firstText).toHaveClass("speaking-dialogue-card__text");
    expect(getComputedStyle(firstText).userSelect).toBe("text");
    expect(getComputedStyle(firstText).touchAction).toBe("auto");

    selectText(firstText, 0, 4);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["turn:first"]).toEqual([{
      start: 0,
      end: 4,
      highlight: true,
      underline: false,
    }]);

    const textPointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(textPointerDown, {
      pointerId: { value: 11 },
      pointerType: { value: "touch" },
      clientX: { value: 20 },
      clientY: { value: 20 },
    });
    firstText.dispatchEvent(textPointerDown);
    expect(textPointerDown.defaultPrevented).toBe(false);
    expect(firstCard).not.toHaveClass("is-dragging");
    const textDragStart = new Event("dragstart", { bubbles: true, cancelable: true });
    firstText.dispatchEvent(textDragStart);
    expect(textDragStart.defaultPrevented).toBe(false);
    const textPointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(textPointerUp, "pointerId", { value: 11 });
    firstText.dispatchEvent(textPointerUp);

    const dropTarget = screen.getByText("请拖拽上面的对话到此处");
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPoint = vi.fn().mockReturnValue(dropTarget);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    const handlePointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(handlePointerDown, {
      pointerId: { value: 12 },
      pointerType: { value: "touch" },
      clientX: { value: 20 },
      clientY: { value: 200 },
    });
    firstHandle.dispatchEvent(handlePointerDown);
    expect(handlePointerDown.defaultPrevented).toBe(true);
    const handlePointerMove = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.defineProperties(handlePointerMove, {
      pointerId: { value: 12 },
      pointerType: { value: "touch" },
      clientX: { value: 20 },
      clientY: { value: 220 },
    });
    act(() => firstHandle.dispatchEvent(handlePointerMove));
    await waitFor(() => expect(firstCard).toHaveClass("is-dragging"));
    const handlePointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(handlePointerUp, "pointerId", { value: 12 });
    act(() => firstHandle.dispatchEvent(handlePointerUp));
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: originalElementFromPoint });
    await screen.findByText("Was möchtest du im Urlaub machen?", { selector: '[data-exam-annotation-region="turn:first"]' });

    const secondText = screen.getByText("Ich möchte wandern.");
    const secondHandle = secondText.closest("article").querySelector("[data-speaking-drag-handle]");
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue("turn:2"),
    };
    fireEvent.dragStart(secondHandle, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "turn:2");
    fireEvent.drop(screen.getAllByText("插入这里").at(-1), { dataTransfer });
    await screen.findByText("Ich möchte wandern.", { selector: '[data-exam-annotation-region="turn:second"]' });

    const checkButton = screen.getByRole("button", { name: "Prüfen" });
    expect(checkButton).not.toBeDisabled();
    fireEvent.click(checkButton);
    await waitFor(() => expect(saveSpeakingTurnState).toHaveBeenCalledWith({
      exercise: 45,
      turn_key: "dialogue-order:all",
      answer_payload: {
        ordered_turn_keys: ["turn:1", "turn:2"],
        is_checked: true,
      },
      is_correct: true,
    }));
  });

  it("resets only the active section answers while clearing all marks for a multi-section exercise", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL3", 46);
    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: {
        task: [{ start: 0, end: 4, highlight: true, underline: false }],
        "turn:first-a": [{ start: 0, end: 4, underline: true, highlight: false }],
      },
    }));
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil3MultiSectionExercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [
      {
        turn_key: "dialogue-order:section:0",
        answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
      },
      {
        turn_key: "dialogue-order:section:1",
        answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
      },
    ] });
    renderPage(3, 46);

    await screen.findByRole("button", { name: "Wiederholen" });
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(saveSpeakingTurnState).toHaveBeenCalledWith({
      exercise: 46,
      turn_key: "dialogue-order:section:0",
      answer_payload: { ordered_turn_keys: [], is_checked: false },
      is_correct: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "进入第 2 个对话段落：Zweiter Termin" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(screen.getByText("Wo treffen wir uns?", { selector: '[data-exam-annotation-region="turn:second-a"]' }))
      .toBeInTheDocument();
  });
});
