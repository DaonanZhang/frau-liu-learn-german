import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchClozeChoiceExerciseDetail } from "../api/exam_preparation/clozeExercises.js";
import {
  fetchClozeMatchingExerciseDetail,
} from "../api/exam_preparation/clozeExercises.js";
import {
  fetchClozeChoiceBlankStates,
  fetchClozeMatchingBlankStates,
} from "../api/exam_preparation/userExerciseStates.js";
import { layoutClozeAnnotations, useClozeAnnotationLayout } from "./clozeAnnotationLayout.js";
import ClozeChoicePage from "./ClozeChoicePage.jsx";
import ClozeMatchingPage from "./ClozeMatchingPage.jsx";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";

vi.mock("../api/exam_preparation/clozeExercises.js", () => ({
  fetchClozeChoiceExerciseDetail: vi.fn(),
  fetchClozeMatchingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchClozeChoiceBlankStates: vi.fn(),
  fetchClozeMatchingBlankStates: vi.fn(),
  saveClozeChoiceBlankState: vi.fn(),
  saveClozeMatchingBlankState: vi.fn(),
}));

const appLayoutStyles = readFileSync(resolve("src/layouts/AppLayout.css"), "utf8");
const clozeStyles = readFileSync(resolve("src/pages/ClozeExercisePage.css"), "utf8");

function selectText(element, start, end) {
  const range = document.createRange();
  range.setStart(element.firstChild, start);
  range.setEnd(element.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function AnnotationLayoutHarness({ isChecked, intrinsicWidth }) {
  const blanks = [{ blank_key: "blank_1" }];
  const {
    annotationLayout,
    clozeTextRef,
    blankRefs,
    detailsRefs,
  } = useClozeAnnotationLayout({ blanks, isChecked, paragraphs: ["test"] });
  const layout = annotationLayout.blank_1;

  return (
    <div className="cloze-text" ref={clozeTextRef}>
      <span
        className="cloze-blank-inline"
        ref={(node) => {
          // eslint-disable-next-line react-hooks/immutability
          blankRefs.current.blank_1 = node;
        }}
      >
        <span className="cloze-drop-slot" />
        <span className="cloze-blank-inline__annotation">
          <span
            className="cloze-choice-inline-details"
            data-intrinsic-width={intrinsicWidth}
            ref={(node) => {
              // eslint-disable-next-line react-hooks/immutability
              detailsRefs.current.blank_1 = node;
            }}
            style={layout ? { width: `${layout.width}px` } : undefined}
          >
            annotation
          </span>
        </span>
      </span>
      <output data-layout-width={layout?.width || ""} />
    </div>
  );
}

describe("Cloze exercise layout", () => {
  it("clamps annotations and assigns only colliding annotations to new lanes", () => {
    const layout = layoutClozeAnnotations({
      containerLeft: 100,
      containerRight: 500,
      annotations: [
        { id: "right", anchor: 480, top: 0, preferredWidth: 180, height: 30 },
        { id: "first", anchor: 120, top: 20, preferredWidth: 180, height: 20 },
        { id: "overlap", anchor: 220, top: 21, preferredWidth: 180, height: 40 },
        { id: "separate", anchor: 330, top: 22, preferredWidth: 100, height: 10 },
      ],
    });

    const getAnnotation = (id) => layout.annotations.find((annotation) => annotation.id === id);
    expect(getAnnotation("right")).toMatchObject({ x: 320, lane: 0, laneOffset: 0, lineHeight: 30, reserveHeight: 30 });
    expect(getAnnotation("first")).toMatchObject({ x: 120, lane: 0, laneOffset: 0, lineHeight: 68, reserveHeight: 68 });
    expect(getAnnotation("overlap")).toMatchObject({ x: 220, lane: 1, laneOffset: 28, lineHeight: 68, reserveHeight: 0 });
    expect(getAnnotation("separate")).toMatchObject({ x: 330, lane: 0, laneOffset: 0, lineHeight: 68, reserveHeight: 0 });
  });

  it("groups anchors with intersecting vertical intervals into one visual row", () => {
    const layout = layoutClozeAnnotations({
      containerLeft: 0,
      containerRight: 500,
      annotations: [
        { id: "tall", anchor: 40, top: 100, anchorBottom: 150, preferredWidth: 100, height: 30 },
        { id: "short", anchor: 240, top: 125, anchorBottom: 140, preferredWidth: 100, height: 20 },
        { id: "next", anchor: 40, top: 160, anchorBottom: 190, preferredWidth: 100, height: 25 },
      ],
    });

    const getAnnotation = (id) => layout.annotations.find((annotation) => annotation.id === id);
    expect(getAnnotation("tall")).toMatchObject({ lane: 0, lineHeight: 30, reserveHeight: 30 });
    expect(getAnnotation("short")).toMatchObject({ lane: 0, lineHeight: 30, reserveHeight: 0 });
    expect(getAnnotation("next")).toMatchObject({ lane: 0, lineHeight: 25, reserveHeight: 25 });
  });

  it("clears checked annotation layout before rebuilding it for a new answer size", async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList.contains("cloze-text")) {
        return { left: 0, right: 500, top: 0, bottom: 100, width: 500, height: 100 };
      }
      if (this.classList.contains("cloze-drop-slot")) {
        return { left: 100, right: 180, top: 0, bottom: 32, width: 80, height: 32 };
      }
      if (this.classList.contains("cloze-blank-inline__annotation")) {
        return { left: 100, right: 100, top: 32, bottom: 32, width: 0, height: 0 };
      }
      if (this.classList.contains("cloze-choice-inline-details")) {
        const width = Number.parseFloat(this.style.width) || Number(this.dataset.intrinsicWidth);
        return { left: 100, right: 100 + width, top: 32, bottom: 52, width, height: 20 };
      }
      return originalGetBoundingClientRect.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        if (this.classList.contains("cloze-choice-inline-details")) {
          return Number.parseFloat(this.style.width) || Number(this.dataset.intrinsicWidth);
        }
        return 0;
      },
    });

    try {
      const { container, rerender } = render(
        <AnnotationLayoutHarness isChecked intrinsicWidth={120} />
      );
      await waitFor(() => {
        expect(container.querySelector("output")).toHaveAttribute("data-layout-width", "120");
      });

      rerender(<AnnotationLayoutHarness isChecked={false} intrinsicWidth={120} />);
      expect(container.querySelector("output")).toHaveAttribute("data-layout-width", "");
      expect(container.querySelector(".cloze-choice-inline-details")).toHaveAttribute("style", "");

      rerender(<AnnotationLayoutHarness isChecked intrinsicWidth={240} />);
      await waitFor(() => {
        expect(container.querySelector("output")).toHaveAttribute("data-layout-width", "240");
      });
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      if (originalScrollWidth) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", originalScrollWidth);
      } else {
        delete HTMLElement.prototype.scrollWidth;
      }
    }
  });

  beforeEach(() => {
    fetchClozeChoiceExerciseDetail.mockResolvedValue({
      id: 17,
      exercise_base: { title: "Cloze", external_id: "17", level: "B1", exercise_type: "CLOZE_CHOICE" },
      content_with_placeholders: "Vor {{blank_1}} nach.",
      blanks: [{
        id: 101,
        blank_key: "blank_1",
        blank_number: 1,
        explanation: "Eine lange Erklärung, die innerhalb des verfügbaren Bereichs umbrechen darf.",
        options: [{ option_key: "A", option_text: "Antwort", is_correct: true }],
      }],
    });
    fetchClozeChoiceBlankStates.mockResolvedValue({
      results: [{
        blank: 101,
        answer_payload: { selected_option_key: "A" },
        is_favorited: false,
      }],
    });
  });

  it("keeps checked annotations below an inline blank without full-row mobile rules", async () => {
    const { container } = render(
      <>
        <style>{clozeStyles}</style>
        <MemoryRouter initialEntries={["/exercise/17"]}>
          <Routes>
            <Route path="/exercise/:exerciseId" element={<ClozeChoicePage />} />
          </Routes>
        </MemoryRouter>
      </>
    );

    const blank = await waitFor(() => {
      const node = container.querySelector(".cloze-blank-inline");
      expect(node).toBeTruthy();
      return node;
    });
    const annotation = blank.querySelector(".cloze-blank-inline__annotation");
    const details = blank.querySelector(".cloze-choice-inline-details");
    const selectedSlot = blank.querySelector(".cloze-drop-slot--selected");

    expect(getComputedStyle(blank).display).toBe("inline-flex");
    expect(getComputedStyle(annotation).display).toBe("block");
    expect(getComputedStyle(annotation).width).toBe("0px");
    expect(getComputedStyle(annotation).position).toBe("static");
    expect(getComputedStyle(details).display).toBe("flex");
    expect(getComputedStyle(details).position).toBe("static");
    expect(getComputedStyle(details).width).toBe("max-content");
    expect(getComputedStyle(details).maxWidth).toBe("min(34rem, calc(100vw - 2rem))");
    expect(getComputedStyle(selectedSlot).width).toBe("max-content");

    const mediaRule = [...container.querySelector("style").sheet.cssRules]
      .find((rule) => rule.media?.mediaText === "(max-width: 990px)");
    const mobileDeclarations = [...(mediaRule?.cssRules || [])]
      .filter((rule) => [".cloze-blank-inline", ".cloze-choice-inline-details", ".cloze-drop-slot"].includes(rule.selectorText));
    expect(mobileDeclarations).toHaveLength(0);
    expect(screen.getByText(/Eine lange Erklärung/)).toBeInTheDocument();
  });

  it("keeps unanswered cloze slots compact", () => {
    expect(clozeStyles).toMatch(/\.cloze-drop-slot--empty\s*\{[^}]*min-width:\s*6rem/);
    expect(clozeStyles).toMatch(/\.cloze-drop-slot--empty\s*\{[^}]*width:\s*6rem[^}]*height:\s*3\.5rem/);
  });

  it("fits selected cloze slots to their answer text", () => {
    expect(clozeStyles).toMatch(/\.cloze-drop-slot--selected\s*\{[^}]*min-width:\s*0[^}]*width:\s*max-content/);
    expect(clozeStyles).toMatch(/\.cloze-drop-slot--selected \.cloze-drop-slot__chip\s*\{[^}]*width:\s*auto/);
  });

  it("keeps Teil 2 unanswered slots compact and selected slots fitted to their text", async () => {
    fetchClozeMatchingExerciseDetail.mockResolvedValue({
      id: 18,
      exercise_base: { title: "Matching", external_id: "18", level: "B1", exercise_type: "CLOZE_MATCHING" },
      content_with_placeholders: "Vor {{blank_1}} nach.",
      options: [{ id: 1, option_key: "A", option_text: "Lange Antwort" }],
      blank_answers: [{
        id: 201,
        blank_key: "blank_1",
        blank_number: 1,
        correct_option: { option_key: "A" },
        explanation: "Erklärung",
      }],
    });
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });

    const { container, unmount } = render(
      <>
        <style>{clozeStyles}</style>
        <MemoryRouter initialEntries={["/matching/18"]}>
          <Routes>
            <Route path="/matching/:exerciseId" element={<ClozeMatchingPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );

    const emptySlot = await waitFor(() => {
      const node = container.querySelector(".cloze-drop-slot");
      expect(node).toBeTruthy();
      expect(node).toHaveClass("cloze-drop-slot--empty");
      return node;
    });
    expect(getComputedStyle(emptySlot).width).toBe("6rem");
    expect(getComputedStyle(emptySlot).height).toBe("3.5rem");
    unmount();

    fetchClozeMatchingBlankStates.mockResolvedValue({
      results: [{
        blank: 201,
        answer_payload: { selected_option_key: "A" },
        is_favorited: false,
      }],
    });
    const { container: selectedContainer } = render(
      <>
        <style>{clozeStyles}</style>
        <MemoryRouter initialEntries={["/matching/18"]}>
          <Routes>
            <Route path="/matching/:exerciseId" element={<ClozeMatchingPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    const selectedSlot = await waitFor(() => {
      const node = selectedContainer.querySelector(".cloze-drop-slot");
      expect(node).toHaveClass("cloze-drop-slot--selected");
      return node;
    });
    expect(getComputedStyle(selectedSlot).width).toBe("max-content");
  });

  it("renders Teil 2 checked answers and explanations inline without a feedback list", async () => {
    fetchClozeMatchingExerciseDetail.mockResolvedValue({
      id: 19,
      exercise_base: { title: "Matching", external_id: "19", level: "B1", exercise_type: "CLOZE_MATCHING" },
      content_with_placeholders: "Vor {{blank_1}} und {{blank_2}} nach.",
      options: [
        { id: 1, option_key: "A", option_text: "Richtig gewählt" },
        { id: 2, option_key: "B", option_text: "Falsche Wahl" },
        { id: 3, option_key: "C", option_text: "Andere Wahl" },
      ],
      blank_answers: [
        {
          id: 301,
          blank_key: "blank_1",
          blank_number: 1,
          correct_option: { option_key: "A" },
          explanation: "Erklärung für <黄>Teil 1</黄>",
        },
        {
          id: 302,
          blank_key: "blank_2",
          blank_number: 2,
          correct_option: { option_key: "B" },
          explanation: "Erklärung für Teil 2",
        },
      ],
    });
    fetchClozeMatchingBlankStates.mockResolvedValue({
      results: [
        { blank: 301, answer_payload: { selected_option_key: "C" }, is_favorited: false },
        { blank: 302, answer_payload: { selected_option_key: "B" }, is_favorited: true },
      ],
    });

    const { container } = render(
      <>
        <style>{clozeStyles}</style>
        <MemoryRouter initialEntries={["/matching/19"]}>
          <Routes>
            <Route path="/matching/:exerciseId" element={<ClozeMatchingPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".cloze-blank-inline__annotation")).toHaveLength(2);
    });
    expect(container.querySelectorAll(".cloze-choice-inline-details")).toHaveLength(2);
    expect(container.querySelectorAll(".cloze-choice-inline-explanation")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /收藏|取消收藏/ })).toHaveLength(2);
    expect(screen.getByText("Richtig")).toBeInTheDocument();
    expect(screen.getByText("Richtig: Richtig gewählt")).toBeInTheDocument();
    expect(container.querySelector(".cloze-feedback-list")).not.toBeInTheDocument();

    expect(getComputedStyle(container.querySelector(".cloze-blank-inline")).display).toBe("inline-flex");
    const mediaRule = [...container.querySelector("style").sheet.cssRules]
      .find((rule) => rule.media?.mediaText === "(max-width: 990px)");
    const mobileDeclarations = [...(mediaRule?.cssRules || [])]
      .filter((rule) => [".cloze-blank-inline", ".cloze-choice-inline-details", ".cloze-drop-slot"].includes(rule.selectorText));
    expect(mobileDeclarations).toHaveLength(0);
  });

  it("keeps the option pool sticky in the viewport at every screen width", () => {
    const { container } = render(
      <>
        <style>{`${appLayoutStyles}\n${clozeStyles}`}</style>
        <div className="app-layout">
          <main className="cloze-page">
            <section className="cloze-pool-panel" />
          </main>
        </div>
      </>
    );

    const layout = container.querySelector(".app-layout");
    const pool = container.querySelector(".cloze-pool-panel");

    expect(getComputedStyle(layout).overflowX).toBe("clip");
    expect(getComputedStyle(pool).position).toBe("sticky");
    expect(getComputedStyle(pool).top).toBe("0px");
    expect(getComputedStyle(pool).zIndex).toBe("20");
  });

  it("registers granular choice learning regions while keeping controls outside regions", async () => {
    fetchClozeChoiceBlankStates.mockResolvedValue({ results: [] });
    fetchClozeChoiceExerciseDetail.mockResolvedValue({
      id: 17,
      exercise_base: { title: "Cloze", external_id: "17", level: "B1", exercise_type: "CLOZE_CHOICE" },
      content_with_placeholders: "Vor {{blank_1}} nach.",
      blanks: [{
        id: 101,
        blank_key: "blank_1",
        blank_number: 1,
        explanation: "Warum diese Antwort passt.",
        options: [
          { id: 11, option_key: "A", option_text: "Antwort A", is_correct: true },
          { id: 12, option_key: "B", option_text: "Antwort B", is_correct: false },
        ],
      }],
    });

    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ClozeChoicePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Lesen Sie den Text und schließen Sie die Lücken. Welche Lösung ist jeweils richtig?"))
      .toHaveAttribute("data-exam-annotation-region", "task");
    expect(screen.getByText(/Vor/).closest('[data-exam-annotation-region="source:0:0"]')).toBeInTheDocument();
    expect(screen.getByText(/nach\./).closest('[data-exam-annotation-region="blank-context:101"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prüfen" })).not.toHaveAttribute("data-exam-annotation-region");

    fireEvent.click(screen.getByRole("button", { name: /1/ }));
    expect(screen.getByText("Antwort A", { selector: '[data-exam-annotation-region="option:101:11"]' }))
      .toBeInTheDocument();
    expect(screen.getByText("Antwort B", { selector: '[data-exam-annotation-region="option:101:12"]' }))
      .toBeInTheDocument();
    expect(screen.getByRole("dialog").closest("[data-exam-annotation-region]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Antwort B/ }));
    expect(screen.getByRole("button", { name: /Antwort B/ })).toBeInTheDocument();
  });

  it("keeps choice checking and clears only the current annotation scope on Wiederholen", async () => {
    window.Highlight = class FakeHighlight {
      constructor(...ranges) {
        this.ranges = ranges;
      }
    };
    window.CSS = { highlights: new Map() };
    const scope = exerciseAnnotationScope("CLOZE_CHOICE", 17);
    const unrelatedScope = exerciseAnnotationScope("CLOZE_MATCHING", 18);
    sessionStorage.setItem(unrelatedScope, JSON.stringify({ version: 1, regions: { source: [{ start: 0, end: 3, highlight: true, underline: false }] } }));
    fetchClozeChoiceBlankStates.mockResolvedValue({ results: [] });

    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ClozeChoicePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const context = await screen.findByText(/nach\./, { selector: '[data-exam-annotation-region="blank-context:101"]' });
    selectText(context, 1, 5);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["blank-context:101"])
      .toEqual([{ start: 1, end: 5, highlight: true, underline: false }]);

    fireEvent.click(await screen.findByRole("button", { name: /1/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Antwort/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    const reset = await screen.findByRole("button", { name: "Wiederholen" });
    expect(screen.getByText(/Richtig/)).toBeInTheDocument();
    fireEvent.click(reset);
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
  });

  it("persists a real text selection through checking and suppresses only modal text-drag clicks", async () => {
    window.Highlight = class FakeHighlight {
      constructor(...ranges) {
        this.ranges = ranges;
      }
    };
    window.CSS = { highlights: new Map() };
    const scope = exerciseAnnotationScope("CLOZE_CHOICE", 17);
    const unrelatedScope = exerciseAnnotationScope("CLOZE_MATCHING", 18);
    sessionStorage.setItem(unrelatedScope, JSON.stringify({ version: 1, regions: { source: [{ start: 0, end: 3, highlight: true, underline: false }] } }));
    fetchClozeChoiceBlankStates.mockResolvedValue({ results: [] });
    fetchClozeChoiceExerciseDetail.mockResolvedValue({
      id: 17,
      exercise_base: { title: "Cloze", external_id: "17", level: "B1", exercise_type: "CLOZE_CHOICE" },
      content_with_placeholders: "Vor {{blank_1}} nach.",
      blanks: [{
        id: 101,
        blank_key: "blank_1",
        blank_number: 1,
        explanation: "Warum diese Antwort passt.",
        options: [
          { id: 11, option_key: "A", option_text: "Antwort A", is_correct: true },
          { id: 12, option_key: "B", option_text: "Antwort B", is_correct: false },
        ],
      }],
    });

    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ClozeChoicePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const context = await screen.findByText(/nach\./, { selector: '[data-exam-annotation-region="blank-context:101"]' });
    selectText(context, 1, 5);
    expect(window.getSelection().toString()).toBe("nach");
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["blank-context:101"])
      .toEqual([{ start: 1, end: 5, highlight: true, underline: false }]);

    fireEvent.click(screen.getByRole("button", { name: /1/ }));
    const optionText = screen.getByText("Antwort A", { selector: '[data-exam-annotation-region="option:101:11"]' });
    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(optionText, { pointerId: 31 });
    selectText(optionText, 0, 4);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(optionText, { pointerId: 31 });
    fireEvent.click(optionText);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(optionText, { pointerId: 32 });
    fireEvent.pointerUp(optionText, { pointerId: 32 });
    fireEvent.click(optionText);
    expect(screen.getByRole("button", { name: /Antwort A/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(sessionStorage.getItem(scope)).toContain("blank-context:101");
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
  });

  it("keeps matching drag and drop operational with annotatable option labels", async () => {
    fetchClozeMatchingExerciseDetail.mockResolvedValue({
      id: 18,
      exercise_base: { title: "Matching", external_id: "18", level: "B1", exercise_type: "CLOZE_MATCHING" },
      content_with_placeholders: "Vor {{blank_1}} nach.",
      options: [{ id: 21, option_key: "A", option_text: "Lange Antwort" }],
      blank_answers: [{ id: 201, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" }, explanation: "Erklärung" }],
    });
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });

    const { container } = render(
      <MemoryRouter initialEntries={["/matching/18"]}>
        <Routes>
          <Route path="/matching/:exerciseId" element={<ClozeMatchingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const option = await screen.findByRole("button", { name: "Lange Antwort" });
    expect(screen.getByText(/Lesen Sie den folgenden Text/)).toHaveAttribute(
      "data-exam-annotation-region",
      "task",
    );
    expect(screen.getByText(/Vor/).closest('[data-exam-annotation-region="source:0:0"]')).toBeInTheDocument();
    expect(screen.getByText(/nach\./).closest('[data-exam-annotation-region="blank-context:201"]')).toBeInTheDocument();
    expect(screen.getByText("Lange Antwort", { selector: '[data-exam-annotation-region="option:pool:21"]' }))
      .toBeInTheDocument();
    expect(option.closest("[data-exam-annotation-region]")).toBeNull();
    const slot = container.querySelector('[data-cloze-blank-key="blank_1"]');
    fireEvent.dragStart(option.querySelector(".cloze-drag-handle"));
    fireEvent.dragOver(slot);
    fireEvent.drop(slot);
    expect(screen.getByRole("button", { name: "Lange Antwort" })).toHaveClass("cloze-drop-slot__chip");
    expect(screen.getByText("Lange Antwort", { selector: '[data-exam-annotation-region="option:201:21"]' }))
      .toBeInTheDocument();
  });
});
