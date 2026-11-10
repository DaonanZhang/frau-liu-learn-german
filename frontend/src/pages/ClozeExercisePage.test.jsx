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
  saveClozeMatchingBlankState,
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

function c1Teil1Fixture() {
  const exampleSentence = "Zuvor hatte er den Vertrag sorgfältig gelesen.";
  return {
    exampleSentence,
    exercise: {
      id: 24,
      exercise_base: { title: "C1 Lesen Teil 1", external_id: "24", level: "C1", exercise_type: "CLOZE_MATCHING" },
      content_with_placeholders: "{{blank_0}} Danach {{blank_1}} und {{blank_2}} weiter.",
      options: [
        { id: 1, option_key: "beispiel", option_text: exampleSentence },
        { id: 2, option_key: "wrong", option_text: "eine falsche Antwort" },
        { id: 3, option_key: "right", option_text: "die richtige Antwort" },
        { id: 4, option_key: "third", option_text: "eine weitere Antwort" },
      ],
      blank_answers: [
        { id: 240, blank_key: "blank_0", blank_number: 0, correct_option: { option_key: "beispiel" } },
        { id: 241, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "right" } },
        { id: 242, blank_key: "blank_2", blank_number: 2, correct_option: { option_key: "third" } },
      ],
    },
  };
}

function selectText(element, start, end) {
  const range = document.createRange();
  range.setStart(element.firstChild, start);
  range.setEnd(element.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAcrossText(startElement, startOffset, endElement, endOffset) {
  const range = document.createRange();
  range.setStart(startElement.firstChild, startOffset);
  range.setEnd(endElement.firstChild, endOffset);
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

  it("moves a later annotation down when rendered details overlap despite separated slot bounds", () => {
    const layout = layoutClozeAnnotations({
      containerLeft: 0,
      containerRight: 500,
      annotations: [
        {
          id: "first",
          anchor: 80,
          top: 100,
          anchorBottom: 120,
          annotationTop: 128,
          preferredWidth: 180,
          height: 36,
        },
        {
          id: "later",
          anchor: 180,
          top: 130,
          anchorBottom: 150,
          annotationTop: 132,
          preferredWidth: 180,
          height: 28,
        },
      ],
    });

    const getAnnotation = (id) => layout.annotations.find((annotation) => annotation.id === id);
    expect(getAnnotation("first")).toMatchObject({ lane: 0, laneOffset: 0, reserveHeight: 72 });
    expect(getAnnotation("later")).toMatchObject({ lane: 1, laneOffset: 44, reserveHeight: 0 });
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

  it("renders C1 options compactly and placed answers as inline bold text", () => {
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-pool-chip\s*\{[^}]*min-height:\s*0[^}]*padding:\s*0\.42rem 0\.58rem[^}]*font-size:\s*0\.85rem[^}]*line-height:\s*1\.35/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-text\s*\{[^}]*font-size:\s*1rem[^}]*line-height:\s*1\.85/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-blank-inline\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-drop-slot--selected\s*\{[^}]*width:\s*auto[^}]*min-height:\s*0[^}]*padding:\s*0[^}]*border:\s*0[^}]*background:\s*transparent[^}]*line-height:\s*inherit/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-select--selected\s*\{[^}]*color:\s*inherit/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-drop-slot--selected \.cloze-drop-slot__chip\s*\{[^}]*display:\s*inline[^}]*width:\s*auto[^}]*min-height:\s*0[^}]*padding:\s*0[^}]*background:\s*transparent[^}]*font-size:\s*1em[^}]*font-weight:\s*800[^}]*line-height:\s*inherit/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-drop-slot--empty\s*\{[^}]*width:\s*2\.5rem[^}]*height:\s*1\.75rem/s);
  });

  it("fits selected cloze slots to their answer text", () => {
    expect(clozeStyles).toMatch(/\.cloze-drop-slot--selected\s*\{[^}]*min-width:\s*0[^}]*width:\s*max-content/);
    expect(clozeStyles).toMatch(/\.cloze-drop-slot--selected \.cloze-drop-slot__chip\s*\{[^}]*width:\s*auto/);
  });

  it("splits a B2 paired answer while rendering its explanation only once", async () => {
    fetchClozeChoiceExerciseDetail.mockResolvedValue({
      id: 17,
      exercise_base: { title: "Cloze", external_id: "17", level: "B2", exercise_type: "CLOZE_CHOICE" },
      content_with_placeholders: "Es ist {{blank_1}} kalt {{blank_1}} warm.",
      blanks: [{
        id: 101,
        blank_key: "blank_1",
        blank_number: 1,
        explanation: "Diese beiden Teile gehören zu derselben Antwort.",
        options: [
          { option_key: "A", option_text: "weder … noch", is_correct: true },
          { option_key: "B", option_text: "entweder … oder", is_correct: false },
        ],
      }],
    });
    fetchClozeChoiceBlankStates.mockResolvedValue({ results: [] });

    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ClozeChoicePage />} />
        </Routes>
      </MemoryRouter>
    );

    const slots = await screen.findAllByRole("button", { name: "1" });
    expect(slots).toHaveLength(2);
    fireEvent.click(slots[0]);
    expect(screen.getAllByRole("dialog", { name: "1" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "entweder … oder" }));
    expect(slots[0]).toHaveTextContent("entweder");
    expect(slots[0]).not.toHaveTextContent("oder");
    expect(slots[1]).toHaveTextContent("oder");
    expect(slots[1]).not.toHaveTextContent("entweder");

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await waitFor(() => {
      expect(screen.getByText("Richtig: weder")).toBeInTheDocument();
      expect(screen.getByText("Richtig: noch")).toBeInTheDocument();
    });
    expect(document.querySelectorAll(".cloze-choice-inline-details")).toHaveLength(2);
    expect(document.querySelectorAll(".cloze-choice-inline-explanation")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "收藏题目" })).toHaveLength(1);
    expect(document.querySelector(".cloze-blank-inline__annotation--compact")).toBeInTheDocument();
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
    expect(screen.getByText("Antwort A")).toBeInTheDocument();
    expect(screen.getByText("Antwort A").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("Antwort B")).toBeInTheDocument();
    expect(screen.getByText("Antwort B").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("dialog").closest("[data-exam-annotation-region]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Antwort B/ }));
    expect(screen.getByRole("button", { name: /Antwort B/ })).toBeInTheDocument();
  });

  it("keeps one paragraph flow across multiple blanks while excluding cloze surfaces", async () => {
    sessionStorage.clear();
    window.Highlight = class FakeHighlight {
      constructor(...ranges) {
        this.ranges = ranges;
      }
    };
    window.CSS = { highlights: new Map() };
    fetchClozeChoiceBlankStates.mockResolvedValue({ results: [] });
    fetchClozeChoiceExerciseDetail.mockResolvedValue({
      id: 19,
      exercise_base: { title: "Flow", external_id: "19", level: "B1", exercise_type: "CLOZE_CHOICE" },
      content_with_placeholders: "Vor {{blank_1}} nach {{blank_2}} Ende.\n\nAndere {{blank_3}}.",
      blanks: [
        { id: 101, blank_key: "blank_1", blank_number: 1, explanation: "Erklärung 1", options: [{ id: 11, option_key: "A", option_text: "eins", is_correct: true }] },
        { id: 102, blank_key: "blank_2", blank_number: 2, explanation: "Erklärung 2", options: [{ id: 12, option_key: "B", option_text: "zwei", is_correct: true }] },
        { id: 103, blank_key: "blank_3", blank_number: 3, explanation: "Erklärung 3", options: [{ id: 13, option_key: "C", option_text: "drei", is_correct: true }] },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/exercise/19"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ClozeChoicePage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText("Vor", { selector: '[data-exam-annotation-region="source:0:0"]' });
    const firstFlow = [...document.querySelectorAll('[data-exam-annotation-flow="cloze-choice:paragraph:0"]')];
    expect(firstFlow.map((node) => node.dataset.examAnnotationRegion)).toEqual([
      "source:0:0", "blank-context:101", "blank-context:102",
    ]);
    expect(document.querySelector('[data-exam-annotation-flow="cloze-choice:paragraph:1"]'))
      .toHaveAttribute("data-exam-annotation-region", "source:1:0");
    expect(document.querySelector('[data-exam-annotation-region="task"]'))
      .not.toHaveAttribute("data-exam-annotation-flow");

    fireEvent.click(screen.getByRole("button", { name: /1/ }));
    expect(document.querySelector('[data-exam-annotation-region^="option:"]')).toBeNull();
    expect(screen.getByRole("dialog").querySelector("[data-exam-annotation-region]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "eins" }));
    fireEvent.click(document.querySelectorAll(".cloze-choice-slot-trigger")[1]);
    fireEvent.click(screen.getByRole("button", { name: "zwei" }));
    fireEvent.click(document.querySelectorAll(".cloze-choice-slot-trigger")[2]);
    fireEvent.click(screen.getByRole("button", { name: "drei" }));
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(document.querySelector('[data-exam-annotation-region^="explanation:"]')).toBeNull();

    const sourceStart = document.querySelector('[data-exam-annotation-region="source:0:0"]');
    const sourceEnd = document.querySelector('[data-exam-annotation-region="blank-context:102"]');
    selectAcrossText(sourceStart, 0, sourceEnd, sourceEnd.textContent.length);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    const stored = JSON.parse(sessionStorage.getItem(exerciseAnnotationScope("CLOZE_CHOICE", 19)));
    expect(Object.keys(stored.regions).sort()).toEqual(["blank-context:101", "blank-context:102", "source:0:0"]);
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
    const optionText = screen.getByText("Antwort A");
    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(optionText, { pointerId: 31 });
    selectText(optionText, 0, 4);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(optionText, { pointerId: 31 });
    fireEvent.click(optionText);
    expect(screen.getByRole("button", { name: /Antwort A/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(sessionStorage.getItem(scope)).toContain("blank-context:101");
    fireEvent.click(screen.getByRole("button", { name: /Antwort A/ }));
    fireEvent.click(screen.getByRole("button", { name: "Antwort B" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["blank-context:101"])
      .toEqual([{ start: 1, end: 5, highlight: true, underline: false }]);
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
  });

  it("keeps Teil 2 cross-blank marks while checking and replacing drag assignments", async () => {
    fetchClozeMatchingExerciseDetail.mockResolvedValue({
      id: 18,
      exercise_base: { title: "Matching", external_id: "18", level: "B1", exercise_type: "CLOZE_MATCHING" },
      content_with_placeholders: "Vor {{blank_1}} nach {{blank_2}} Ende.",
      options: [
        { id: 21, option_key: "A", option_text: "Lange Antwort" },
        { id: 22, option_key: "B", option_text: "Kurze Antwort" },
      ],
      blank_answers: [
        { id: 201, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" }, explanation: "Erklärung 1" },
        { id: 202, blank_key: "blank_2", blank_number: 2, correct_option: { option_key: "B" }, explanation: "Erklärung 2" },
      ],
    });
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });
    window.Highlight = class FakeHighlight {
      constructor(...ranges) {
        this.ranges = ranges;
      }
    };
    window.CSS = { highlights: new Map() };
    sessionStorage.clear();

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
    expect(screen.getByText(/nach/).closest('[data-exam-annotation-region="blank-context:201"]')).toBeInTheDocument();
    expect(screen.getByText("Lange Antwort")).toBeInTheDocument();
    expect(screen.getByText("Lange Antwort").closest("[data-exam-annotation-region]")).toBeNull();
    expect(option.closest("[data-exam-annotation-region]")).toBeNull();

    const sourceStart = document.querySelector('[data-exam-annotation-region="source:0:0"]');
    const sourceEnd = document.querySelector('[data-exam-annotation-region="blank-context:202"]');
    selectAcrossText(sourceStart, 0, sourceEnd, sourceEnd.textContent.length);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    const scope = exerciseAnnotationScope("CLOZE_MATCHING", 18);
    const marked = JSON.parse(sessionStorage.getItem(scope));
    expect(Object.keys(marked.regions).sort()).toEqual(["blank-context:201", "blank-context:202", "source:0:0"]);

    const slot = container.querySelector('[data-cloze-blank-key="blank_1"]');
    expect(option).toHaveAttribute("draggable", "true");
    expect(option.querySelector(".cloze-drag-handle")).toBeNull();
    fireEvent.dragStart(option);
    fireEvent.dragOver(slot);
    fireEvent.drop(slot);
    const selectedOption = screen.getByRole("button", { name: "Lange Antwort" });
    expect(selectedOption).toHaveClass("cloze-drop-slot__chip");
    expect(selectedOption).toHaveAttribute("draggable", "true");
    expect(selectedOption.querySelector(".cloze-drag-handle")).toBeNull();
    const secondOption = screen.getByRole("button", { name: "Kurze Antwort" });
    const secondSlot = container.querySelector('[data-cloze-blank-key="blank_2"]');
    fireEvent.dragStart(secondOption);
    fireEvent.dragOver(secondSlot);
    fireEvent.drop(secondSlot);
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByText("Erklärung 1");
    expect(document.querySelector('[data-exam-annotation-region^="option:"]')).toBeNull();
    expect(document.querySelector('[data-exam-annotation-region^="explanation:"]')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(scope)).regions).toEqual(marked.regions);

    const pool = container.querySelector("[data-cloze-pool]");
    fireEvent.dragStart(selectedOption);
    fireEvent.drop(pool);
    const restoredOption = screen.getByRole("button", { name: "Lange Antwort" });
    expect(restoredOption).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(restoredOption);
    fireEvent.dragOver(slot);
    fireEvent.drop(slot);
    expect(JSON.parse(sessionStorage.getItem(scope)).regions).toEqual(marked.regions);
  });

  it("limits C1 blank zero to its data-defined example sentence and reveals it after checking", async () => {
    const { exampleSentence, exercise } = c1Teil1Fixture();
    fetchClozeMatchingExerciseDetail.mockResolvedValue(exercise);
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });

    const { container } = render(
      <MemoryRouter initialEntries={["/matching/c1/24"]}>
        <Routes>
          <Route path="/matching/:level/:exerciseId" element={<ClozeMatchingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const exampleOption = await screen.findByRole("button", { name: `选择“${exampleSentence}”并填入当前空格` });
    expect(screen.getByText("将 Beispiel 拖到标有 0 的空格中").parentElement)
      .toContainElement(exampleOption);
    expect(container.querySelector('[data-cloze-blank-key="blank_0"]')).toHaveTextContent("0");
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).not.toHaveClass("cloze-drop-slot--guided");
    expect(container.querySelector('[data-cloze-blank-key="blank_2"]')).not.toHaveClass("cloze-drop-slot--guided");
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-pool-chip[^{}]*\{[^}]*max-width:[^}]*min-width:[^}]*overflow-wrap:[^}]*white-space:/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1[^{}]*\.cloze-drop-slot__chip[^{}]*\{[^}]*max-width:[^}]*min-width:[^}]*overflow-wrap:[^}]*white-space:/s);
    expect(clozeStyles).toMatch(/\.cloze-c1-example-guide__callout[^{}]*\{(?=[^}]*background:)(?=[^}]*border:)[^}]*pointer-events:\s*none/s);
    expect(screen.queryByRole("button", { name: /falsche Antwort/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `选择“${exampleSentence}”并填入当前空格` }));
    expect(container.querySelector('[data-cloze-blank-key="blank_0"]')).toHaveTextContent(exampleSentence);
    expect(screen.queryByText("将 Beispiel 拖到标有 0 的空格中")).not.toBeInTheDocument();
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).toHaveClass("cloze-drop-slot--guided");

    fireEvent.click(screen.getByRole("button", { name: /die richtige Antwort/ }));
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).not.toHaveClass("cloze-drop-slot--guided");
    expect(container.querySelector('[data-cloze-blank-key="blank_2"]')).toHaveClass("cloze-drop-slot--guided");
    fireEvent.click(container.querySelector('[data-cloze-blank-key="blank_2"]'));
    fireEvent.click(screen.getByRole("button", { name: /eine weitere Antwort/ }));
    expect(container.querySelector('[data-cloze-blank-key="blank_2"]')).not.toHaveClass("cloze-drop-slot--guided");
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(screen.queryByText("正在保存作答状态...")).not.toBeInTheDocument();
    await waitFor(() => expect(saveClozeMatchingBlankState).toHaveBeenCalled());
    expect(screen.queryByText("已保存本次批改结果。")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Wiederholen/ }));
    expect(screen.getByText("将 Beispiel 拖到标有 0 的空格中")).toBeInTheDocument();
    expect(container.querySelector('[data-cloze-blank-key="blank_0"]')).toHaveTextContent("0");
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).not.toHaveClass("cloze-drop-slot--guided");
    fireEvent.click(screen.getByRole("button", { name: `选择“${exampleSentence}”并填入当前空格` }));

    const wrongOption = screen.getByRole("button", { name: /falsche Antwort/ });
    fireEvent.dragStart(wrongOption);
    fireEvent.dragOver(container.querySelector('[data-cloze-blank-key="blank_0"]'));
    fireEvent.drop(container.querySelector('[data-cloze-blank-key="blank_0"]'));
    expect(container.querySelector('[data-cloze-blank-key="blank_0"]')).toHaveTextContent(exampleSentence);
    fireEvent.click(wrongOption);
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).toHaveTextContent("eine falsche Antwort");
    fireEvent.click(container.querySelector('[data-cloze-blank-key="blank_2"]'));
    fireEvent.click(screen.getByRole("button", { name: /eine weitere Antwort/ }));
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));

    expect(container.querySelector('[data-cloze-blank-key="blank_0"] .cloze-drop-slot__chip'))
      .toHaveClass("cloze-drop-slot__chip--correct");
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]').closest(".cloze-blank-inline").querySelector(".cloze-inline-feedback"))
      .toHaveClass("cloze-inline-feedback--answer");
    expect(await screen.findByRole("button", { name: "Wiederholen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    expect(container.querySelector('[data-cloze-blank-key="blank_0"]')).not.toHaveTextContent(exampleSentence);
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).not.toHaveTextContent("eine falsche Antwort");
  });

  it("guides the learner to the next green C1 blank after dragging away Beispiel 0", async () => {
    const { exampleSentence, exercise } = c1Teil1Fixture();
    fetchClozeMatchingExerciseDetail.mockResolvedValue(exercise);
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });

    const { container } = render(
      <MemoryRouter initialEntries={["/matching/c1/24"]}>
        <Routes>
          <Route path="/matching/:level/:exerciseId" element={<ClozeMatchingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const exampleOption = await screen.findByRole("button", { name: `选择“${exampleSentence}”并填入当前空格` });
    expect(screen.queryByText("请点击下一个绿色空格继续选择")).not.toBeInTheDocument();

    fireEvent.dragStart(exampleOption);
    fireEvent.dragOver(container.querySelector('[data-cloze-blank-key="blank_0"]'));
    fireEvent.drop(container.querySelector('[data-cloze-blank-key="blank_0"]'));

    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).toHaveClass("cloze-drop-slot--guided");
    expect(screen.getByText("请点击下一个绿色空格继续选择")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /die richtige Antwort/ })).not.toBeInTheDocument();

    fireEvent.click(container.querySelector('[data-cloze-blank-key="blank_1"]'));

    expect(screen.queryByText("请点击下一个绿色空格继续选择")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /die richtige Antwort/ })).toBeInTheDocument();
  });

  it("keeps C1 actions below both columns and hides restored state copy", async () => {
    const { exercise } = c1Teil1Fixture();
    fetchClozeMatchingExerciseDetail.mockResolvedValue(exercise);
    fetchClozeMatchingBlankStates.mockResolvedValue({
      results: [
        { blank: 240, answer_payload: { selected_option_key: "beispiel" }, is_favorited: false },
        { blank: 241, answer_payload: { selected_option_key: "right" }, is_favorited: false },
        { blank: 242, answer_payload: { selected_option_key: "third" }, is_favorited: false },
      ],
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/matching/c1/24"]}>
        <Routes>
          <Route path="/matching/:level/:exerciseId" element={<ClozeMatchingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "Wiederholen" });
    expect(screen.queryByText("已恢复上次批改后的作答状态。")).not.toBeInTheDocument();
    const actions = container.querySelector(".cloze-actions");
    const textPanel = container.querySelector(".cloze-text-panel");
    const poolPanel = container.querySelector(".cloze-pool-panel");
    expect(textPanel.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(poolPanel.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clozeStyles).toMatch(/\.cloze-shell--c1\s*\{(?=[^}]*width:\s*100%)[^}]*\}/s);
    expect(clozeStyles).toMatch(/\.cloze-shell--c1\s*>\s*\.cloze-actions\s*\{(?=[^}]*grid-row:\s*6)(?=[^}]*justify-content:\s*flex-end)[^}]*\}/s);
    expect(clozeStyles).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.cloze-shell--c1\s+\.cloze-check-btn,[\s\S]*?\.cloze-shell--c1\s+\.cloze-reset-btn\s*\{[^}]*width:\s*100%/s);
  });

  it("keeps guidance on the earliest unanswered C1 blank when a later blank is filled first", async () => {
    const { exampleSentence, exercise } = c1Teil1Fixture();
    fetchClozeMatchingExerciseDetail.mockResolvedValue(exercise);
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });
    const { container } = render(
      <MemoryRouter initialEntries={["/matching/c1/24"]}>
        <Routes>
          <Route path="/matching/:level/:exerciseId" element={<ClozeMatchingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: `选择“${exampleSentence}”并填入当前空格` }));
    const blankOne = container.querySelector('[data-cloze-blank-key="blank_1"]');
    const blankTwo = container.querySelector('[data-cloze-blank-key="blank_2"]');
    expect(blankOne).toHaveClass("cloze-drop-slot--guided");
    fireEvent.dragStart(screen.getByRole("button", { name: /eine weitere Antwort/ }));
    fireEvent.dragOver(blankTwo);
    fireEvent.drop(blankTwo);
    expect(blankOne).toHaveClass("cloze-drop-slot--guided");
    expect(blankTwo).not.toHaveClass("cloze-drop-slot--guided");
  });

  it("returns C1 guidance to an earlier blank when its answer is removed", async () => {
    const { exampleSentence, exercise } = c1Teil1Fixture();
    fetchClozeMatchingExerciseDetail.mockResolvedValue(exercise);
    fetchClozeMatchingBlankStates.mockResolvedValue({ results: [] });
    const { container } = render(
      <MemoryRouter initialEntries={["/matching/c1/24"]}>
        <Routes>
          <Route path="/matching/:level/:exerciseId" element={<ClozeMatchingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: `选择“${exampleSentence}”并填入当前空格` }));
    fireEvent.click(container.querySelector('[data-cloze-blank-key="blank_1"]'));
    fireEvent.click(screen.getByRole("button", { name: /die richtige Antwort/ }));
    fireEvent.click(container.querySelector('[data-cloze-blank-key="blank_2"]'));
    fireEvent.click(screen.getByRole("button", { name: /eine weitere Antwort/ }));
    expect(container.querySelector('[data-cloze-blank-key="blank_2"]')).not.toHaveClass("cloze-drop-slot--guided");

    const pool = container.querySelector("[data-cloze-pool]");
    fireEvent.dragStart(container.querySelector('[data-cloze-blank-key="blank_1"] .cloze-drop-slot__chip'));
    fireEvent.drop(pool);
    expect(container.querySelector('[data-cloze-blank-key="blank_1"]')).toHaveClass("cloze-drop-slot--guided");
  });
});
