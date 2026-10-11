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
