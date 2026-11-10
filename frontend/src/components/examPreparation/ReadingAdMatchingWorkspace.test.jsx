import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReadingAdMatchingWorkspace from "./ReadingAdMatchingWorkspace.jsx";
import { ExamTextAnnotationProvider } from "./ExamTextAnnotations.jsx";

const exercise = {
  id: 7,
  ads: [
    { id: 11, ad_key: "a", ad_text_markdown: "Anzeige A\nText A" },
    { id: 12, ad_key: "b", ad_text_markdown: "Anzeige B\nText B" },
    { id: 13, ad_key: "c", ad_text_markdown: "Anzeige C\nText C" },
    { id: 14, ad_key: "d", ad_text_markdown: "Anzeige D\nText D" },
    { id: 15, ad_key: "e", ad_text_markdown: "Anzeige E\nText E" },
    { id: 16, ad_key: "f", ad_text_markdown: "Anzeige F\nText F" },
  ],
  items: [{
    id: 21,
    item_number: 1,
    item_text: "Situation eins",
    correct_ad: { ad_key: "a" },
    explanation: "Erklärung eins",
  }],
};

const styleSource = readFileSync(resolve("src/pages/ReadingAdMatchingPage.css"), "utf8");

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
  document.dispatchEvent(new Event("selectionchange"));
}

beforeEach(() => {
  window.Highlight = FakeHighlight;
  window.CSS = { highlights: new Map() };
});

afterEach(() => {
  document.body.replaceChildren();
  delete window.Highlight;
  delete window.CSS;
});

function renderWorkspace(props = {}) {
  return render(
    <ExamTextAnnotationProvider scope="exam-annotations:v1:exercise:READING_AD_MATCHING:7">
      <ReadingAdMatchingWorkspace
        exercise={exercise}
        answers={{}}
        onAnswer={vi.fn()}
        annotationsEnabled
        {...props}
      />
    </ExamTextAnnotationProvider>,
  );
}

describe("ReadingAdMatchingWorkspace annotations", () => {
  it("registers stable learning-text regions without wrapping controls", () => {
    renderWorkspace();

    const ad = document.querySelector('[aria-label="Anzeige A"]');
    const adRegion = document.querySelector('[data-exam-annotation-region="ad:11"]');
    expect(ad).not.toHaveAttribute("data-exam-annotation-region");
    expect(adRegion).toHaveTextContent("Anzeige A");
    expect(adRegion).toHaveTextContent("Text A");
    expect(ad.querySelector(".reading-ad-card__number").closest("[data-exam-annotation-region]")).toBeNull();
    expect(document.querySelector('[data-exam-annotation-region="item:21"]')).toHaveTextContent("Situation eins");
    expect(document.querySelector('[data-exam-annotation-region="option:21:11"]')).toHaveTextContent("A");
    expect(document.querySelector('[data-exam-annotation-region="option:21:12"]')).toHaveTextContent("B");
    expect(document.querySelector('[data-exam-annotation-region="ad:13"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anzeige page 1" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getAllByRole("radio")[0].closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "Anzeige page 1" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(styleSource).toMatch(/\.reading-ad-option__key\s*\{[^}]*user-select:\s*text/);
    expect(styleSource).toMatch(/\.reading-ad-option__key\s*\{[^}]*-webkit-user-select:\s*text/);
  });

  it("keeps matching selection and carousel controls working", () => {
    const onAnswer = vi.fn();
    renderWorkspace({ onAnswer });

    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(onAnswer).toHaveBeenCalledWith(21, "a");

    fireEvent.click(screen.getByRole("button", { name: "Anzeige page 2" }));
    expect(screen.getByRole("button", { name: "Anzeige page 2" })).toBeInTheDocument();
    expect(document.querySelector('[data-exam-annotation-region="ad:13"]')).toHaveTextContent("Text C");
  });

  it("shows the C1 article on the left, allows repeated paragraphs, and lists A-E in order", () => {
    const onAnswer = vi.fn();
    const c1Exercise = {
      ...exercise,
      ads: [
        { id: 15, ad_key: "e", ad_order: 5, ad_text_markdown: "Anzeige E" },
        { id: 13, ad_key: "c", ad_order: 3, ad_text_markdown: "Anzeige C" },
        { id: 11, ad_key: "a", ad_order: 1, ad_text_markdown: "Anzeige A" },
        { id: 14, ad_key: "d", ad_order: 4, ad_text_markdown: "Anzeige D" },
        { id: 12, ad_key: "b", ad_order: 2, ad_text_markdown: "Anzeige B" },
      ],
      items: [
        { id: 31, item_number: 1, item_text: "Situation eins", correct_ad: { ad_key: "a" } },
        { id: 32, item_number: 2, item_text: "Situation zwei", correct_ad: { ad_key: "a" } },
      ],
    };
    const { container } = renderWorkspace({ exercise: c1Exercise, onAnswer, allowRepeated: true, showAllAds: true });

    expect(container.querySelectorAll(".reading-ad-card__number")).toHaveLength(5);
    expect([...container.querySelectorAll(".reading-ad-card__number")].map((node) => node.textContent)).toEqual([
      "Abschnitt A", "Abschnitt B", "Abschnitt C", "Abschnitt D", "Abschnitt E",
    ]);
    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(onAnswer).toHaveBeenCalledWith(31, "a");
    fireEvent.click(screen.getByRole("button", { name: "下一题 →" }));
    expect(screen.getByText("Situation zwei")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(onAnswer).toHaveBeenLastCalledWith(32, "a");
    fireEvent.click(screen.getByRole("button", { name: "← 上一题" }));
    expect(screen.getByText("Situation eins")).toBeInTheDocument();

    const workspace = container.querySelector(".reading-ad-workspace");
    expect(workspace).toHaveClass("reading-ad-workspace--c1");
    expect(workspace.querySelector(".reading-ad-question-section")).toBeInTheDocument();
    expect(styleSource).toMatch(/\.reading-ad-workspace--c1\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(18rem,\s*0\.85fr\)/s);
    expect(styleSource).toMatch(/\.reading-ad-workspace--c1\s*>\s*\.reading-ad-sticky-stack\s*\{[^}]*grid-column:\s*1/s);
    expect(styleSource).toMatch(/\.reading-ad-workspace--c1\s*>\s*\.reading-ad-sticky-stack\s*\{[^}]*display:\s*block/s);
    expect(styleSource).toMatch(/\.reading-ad-workspace--c1\s*>\s*\.reading-ad-question-section\s*\{[^}]*grid-column:\s*2/s);
    expect(styleSource).toMatch(/\.reading-ad-workspace--c1\s*>\s*\.reading-ad-question-section\s*\{[^}]*flex-wrap:\s*nowrap/s);
    expect(styleSource).toMatch(/\.reading-ad-workspace--c1\s*>\s*\.reading-ad-sticky-stack,[^{]*\.reading-ad-workspace--c1\s*>\s*\.reading-ad-question-section\s*\{[^}]*overflow-y:\s*auto/s);
  });

  it("cleans the Version 2 prefix but hides its label by default", () => {
    renderWorkspace({
      exercise: {
        ...exercise,
        items: Array.from({ length: 6 }, (_, index) => ({
          ...exercise.items[0],
          id: 21 + index,
          item_number: index + 1,
          item_text: index === 0 ? " ( version2 )  Diese Anzeige ist passend." : `Situation ${index + 1}`,
        })),
      },
      showAllAds: true,
    });

    expect(screen.getByText("Diese Anzeige ist passend.")).toBeInTheDocument();
    expect(screen.queryByText(/\(\s*version2\s*\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText("备用题 · Version 2")).not.toBeInTheDocument();
  });

  it("marks only version 2 questions when enabled and recognizes the legacy prefix", () => {
    const version2Exercise = {
      ...exercise,
      items: [
        { ...exercise.items[0], id: 21, item_text: "(Version2) Diese Anzeige ist passend." },
        { ...exercise.items[0], id: 22, item_number: 2, item_text: "Normale Situation", is_version2: false },
        { ...exercise.items[0], id: 23, item_number: 3, item_text: "Explizit markiert", is_version2: true },
        { ...exercise.items[0], id: 24, item_number: 4, item_text: "Nicht (Version2) am Satzanfang" },
      ],
    };
    renderWorkspace({ exercise: version2Exercise, showAllAds: true, showVersion2Label: true });

    expect(screen.getByText("Diese Anzeige ist passend.")).toBeInTheDocument();
    expect(screen.getByText("备用题 · Version 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一题 →" }));
    expect(screen.getByText("Normale Situation")).toBeInTheDocument();
    expect(screen.queryByText("备用题 · Version 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一题 →" }));
    expect(screen.getByText("Explizit markiert")).toBeInTheDocument();
    expect(screen.getByText("备用题 · Version 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一题 →" }));
    expect(screen.getByText("Nicht (Version2) am Satzanfang")).toBeInTheDocument();
    expect(screen.queryByText("备用题 · Version 2")).not.toBeInTheDocument();
  });

  it("moves to the next C1 question with a horizontal touch swipe", () => {
    const { container } = renderWorkspace({
      exercise: { ...exercise, items: [...exercise.items, { ...exercise.items[0], id: 22, item_number: 2, item_text: "Situation zwei" }] },
      showAllAds: true,
      allowRepeated: true,
    });
    const questions = container.querySelector(".reading-ad-question-section");
    fireEvent.touchStart(questions, { touches: [{ clientX: 220 }] });
    fireEvent.touchEnd(questions, { changedTouches: [{ clientX: 140 }] });
    expect(screen.getByText("Situation zwei")).toBeInTheDocument();
  });

  it("suppresses only a generated label click after selecting option text", () => {
    const onAnswer = vi.fn();
    renderWorkspace({ onAnswer });
    const optionText = document.querySelector('[data-exam-annotation-region="option:21:11"]');

    fireEvent.pointerDown(optionText, { pointerId: 1 });
    selectText(optionText, 0, 1);
    fireEvent.pointerUp(optionText, { pointerId: 1 });
    fireEvent.click(optionText);
    expect(onAnswer).not.toHaveBeenCalled();

    const ordinaryLabel = screen.getByText("B", { selector: '[data-exam-annotation-region="option:21:12"]' }).closest("label");
    fireEvent.click(ordinaryLabel);
    expect(onAnswer).toHaveBeenCalledWith(21, "b");
  });

  it("registers explanation text only in review mode", () => {
    renderWorkspace({
      review: true,
      answers: { 21: "b" },
      favoriteFor: () => ({ isFavorited: false, pending: false, onClick: vi.fn() }),
    });

    expect(document.querySelector('[data-exam-annotation-region="explanation:21"]')).toHaveTextContent("Erklärung eins");
    const correctOption = document.querySelector('[data-exam-annotation-region="option:21:11"]');
    expect(correctOption.closest("label")).toHaveClass("reading-ad-option--correct");
    expect(correctOption.closest("label")).toBeVisible();
    expect(screen.getByText("Falsch").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "收藏题目" }).closest("[data-exam-annotation-region]")).toBeNull();
  });
});
