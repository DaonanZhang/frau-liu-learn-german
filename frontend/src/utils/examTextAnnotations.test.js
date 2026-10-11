import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyAnnotationStyle,
  clearAllExamAnnotations,
  clearAnnotationScope,
  clearAnnotationStyles,
  domPointToTextOffset,
  exerciseAnnotationScope,
  findAnnotationSegmentAtOffset,
  getAnnotationStyleState,
  getAnnotationToolbarPosition,
  loadAnnotationState,
  mockAnnotationScope,
  normalizeAnnotationSegments,
  removeAnnotationStyle,
  saveAnnotationState,
  selectionToAnnotationRange,
  textOffsetToDomPoint,
} from "./examTextAnnotations.js";

const emptyState = { version: 1, regions: {} };

describe("exam text annotation interval model", () => {
  it("produces the same segments when highlight and underline are applied in either order", () => {
    const highlightThenUnderline = applyAnnotationStyle(
      applyAnnotationStyle([], { start: 0, end: 3 }, "highlight"),
      { start: 1, end: 4 },
      "underline",
    );
    const underlineThenHighlight = applyAnnotationStyle(
      applyAnnotationStyle([], { start: 1, end: 4 }, "underline"),
      { start: 0, end: 3 },
      "highlight",
    );

    expect(highlightThenUnderline).toEqual([
      { start: 0, end: 1, highlight: true, underline: false },
      { start: 1, end: 3, highlight: true, underline: true },
      { start: 3, end: 4, highlight: false, underline: true },
    ]);
    expect(underlineThenHighlight).toEqual(highlightThenUnderline);
  });

  it("splits a segment when one style is removed from its middle", () => {
    expect(removeAnnotationStyle(
      [{ start: 0, end: 8, highlight: true, underline: true }],
      { start: 3, end: 5 },
      "highlight",
    )).toEqual([
      { start: 0, end: 3, highlight: true, underline: true },
      { start: 3, end: 5, highlight: false, underline: true },
      { start: 5, end: 8, highlight: true, underline: true },
    ]);
  });

  it("merges adjacent segments with identical style flags", () => {
    expect(normalizeAnnotationSegments([
      { start: 4, end: 6, highlight: false, underline: true },
      { start: 0, end: 2, highlight: true, underline: false },
      { start: 2, end: 4, highlight: true, underline: false },
    ])).toEqual([
      { start: 0, end: 4, highlight: true, underline: false },
      { start: 4, end: 6, highlight: false, underline: true },
    ]);
  });

  it("clears only the selected overlap and keeps the left and right pieces", () => {
    expect(clearAnnotationStyles(
      [{ start: 0, end: 10, highlight: true, underline: true }],
      { start: 3, end: 7 },
    )).toEqual([
      { start: 0, end: 3, highlight: true, underline: true },
      { start: 7, end: 10, highlight: true, underline: true },
    ]);
  });

  it("reports inactive, active, and mixed style state", () => {
    const segments = [
      { start: 0, end: 3, highlight: true, underline: false },
      { start: 3, end: 6, highlight: false, underline: false },
      { start: 6, end: 9, highlight: true, underline: false },
    ];

    expect(getAnnotationStyleState(segments, { start: 3, end: 6 }, "highlight")).toBe("inactive");
    expect(getAnnotationStyleState(segments, { start: 0, end: 3 }, "highlight")).toBe("active");
    expect(getAnnotationStyleState(segments, { start: 0, end: 6 }, "highlight")).toBe("mixed");
  });

  it("finds a segment at its start and inside it, but not at its exclusive end", () => {
    const segment = { start: 2, end: 5, highlight: true, underline: false };
    const segments = [segment];

    expect(findAnnotationSegmentAtOffset(segments, 2)).toEqual(segment);
    expect(findAnnotationSegmentAtOffset(segments, 4)).toEqual(segment);
    expect(findAnnotationSegmentAtOffset(segments, 5)).toBeNull();
  });

  it("rejects invalid or style-less segments during normalization", () => {
    expect(normalizeAnnotationSegments([
      { start: Number.NaN, end: 2, highlight: true },
      { start: -1, end: 2, highlight: true },
      { start: 3, end: 2, highlight: true },
      { start: 3, end: 3, highlight: true },
      { start: 3, end: 4, highlight: false, underline: false },
      { start: 5, end: 6, highlight: true, underline: false },
    ])).toEqual([{ start: 5, end: 6, highlight: true, underline: false }]);
  });

  it("rejects fractional offsets during normalization and style application", () => {
    expect(normalizeAnnotationSegments([
      { start: 0.5, end: 2, highlight: true, underline: false },
    ])).toEqual([]);
    expect(applyAnnotationStyle([], { start: 0.5, end: 2 }, "highlight")).toEqual([]);
  });
});

describe("exam text annotation storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("builds exact exercise and mock scopes", () => {
    expect(exerciseAnnotationScope("READING_UNDERSTANDING", 17))
      .toBe("exam-annotations:v1:exercise:READING_UNDERSTANDING:17");
    expect(mockAnnotationScope(31)).toBe("exam-annotations:v1:mock:31");
  });

  it("round-trips a valid state through sessionStorage", () => {
    const state = {
      version: 1,
      regions: {
        "question:42": [{ start: 3, end: 12, highlight: true, underline: false }],
      },
    };
    const scope = exerciseAnnotationScope("READING_UNDERSTANDING", 17);

    expect(saveAnnotationState(scope, state)).toBe(true);
    expect(loadAnnotationState(scope)).toEqual(state);
  });

  it("discards malformed JSON and removes it when possible", () => {
    const scope = mockAnnotationScope(31);
    sessionStorage.setItem(scope, "{not-json");

    expect(loadAnnotationState(scope)).toEqual(emptyState);
    expect(sessionStorage.getItem(scope)).toBeNull();
  });

  it("discards wrong versions and invalid regions", () => {
    const scope = mockAnnotationScope(31);
    sessionStorage.setItem(scope, JSON.stringify({ version: 2, regions: {} }));
    expect(loadAnnotationState(scope)).toEqual(emptyState);

    sessionStorage.setItem(scope, JSON.stringify({ version: 1, regions: [] }));
    expect(loadAnnotationState(scope)).toEqual(emptyState);
  });

  it("discards stored regions with fractional offsets", () => {
    const scope = mockAnnotationScope(31);
    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: { passage: [{ start: 0.5, end: 2, highlight: true, underline: false }] },
    }));

    expect(loadAnnotationState(scope)).toEqual(emptyState);
    expect(sessionStorage.getItem(scope)).toBeNull();
  });

  it("clears one annotation scope without touching another", () => {
    const first = mockAnnotationScope(31);
    const second = mockAnnotationScope(32);
    sessionStorage.setItem(first, JSON.stringify(emptyState));
    sessionStorage.setItem(second, JSON.stringify(emptyState));

    clearAnnotationScope(first);

    expect(sessionStorage.getItem(first)).toBeNull();
    expect(sessionStorage.getItem(second)).not.toBeNull();
  });

  it("clears every annotation key but keeps unrelated session data", () => {
    sessionStorage.setItem(mockAnnotationScope(31), JSON.stringify(emptyState));
    sessionStorage.setItem(exerciseAnnotationScope("READING_UNDERSTANDING", 17), JSON.stringify(emptyState));
    sessionStorage.setItem("unrelated", "keep");

    clearAllExamAnnotations();

    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    expect(sessionStorage.getItem(exerciseAnnotationScope("READING_UNDERSTANDING", 17))).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("returns false instead of throwing when serialization or storage fails", () => {
    const scope = mockAnnotationScope(31);
    const circular = {};
    circular.self = circular;
    expect(() => saveAnnotationState(scope, circular)).not.toThrow();
    expect(saveAnnotationState(scope, circular)).toBe(false);

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveAnnotationState(scope, emptyState)).toBe(false);
    setItemSpy.mockRestore();
  });
});

describe("exam text annotation DOM offsets", () => {
  function makeRegion() {
    const region = document.createElement("div");
    region.dataset.examAnnotationRegion = "reading-passage";
    region.innerHTML = "A <span>bold <em>text</em></span> end";
    document.body.appendChild(region);
    return region;
  }

  afterEach(() => document.body.replaceChildren());

  it("maps offsets across nested text nodes using UTF-16 lengths", () => {
    const region = makeRegion();
    const textNode = region.querySelector("em").firstChild;

    expect(region.textContent).toBe("A bold text end");
    expect(domPointToTextOffset(region, textNode, 2)).toBe(9);
    expect(textOffsetToDomPoint(region, 9)).toEqual({ node: textNode, offset: 2 });
  });

  it("maps emoji offsets as UTF-16 code units in both directions", () => {
    const region = document.createElement("div");
    region.dataset.examAnnotationRegion = "emoji";
    region.textContent = "A 😀 B";
    document.body.appendChild(region);
    const textNode = region.firstChild;

    expect(domPointToTextOffset(region, textNode, 4)).toBe(4);
    expect(textOffsetToDomPoint(region, 4)).toEqual({ node: textNode, offset: 4 });
  });

  it("rejects DOM points outside the root or outside a text node", () => {
    const region = makeRegion();
    const outside = document.createTextNode("outside");
    document.body.appendChild(outside);

    expect(domPointToTextOffset(region, outside, 0)).toBeNull();
    expect(domPointToTextOffset(region, region.firstChild, 99)).toBeNull();
    expect(textOffsetToDomPoint(region, -1)).toBeNull();
    expect(textOffsetToDomPoint(region, region.textContent.length + 1)).toBeNull();
  });

  it("extracts a single-region selection and rejects a cross-region selection", () => {
    const region = makeRegion();
    const secondRegion = document.createElement("div");
    secondRegion.dataset.examAnnotationRegion = "other";
    secondRegion.textContent = "another";
    document.body.appendChild(secondRegion);

    const firstRange = document.createRange();
    firstRange.setStart(region.firstChild, 2);
    firstRange.setEnd(region.querySelector("em").firstChild, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(firstRange);

    expect(selectionToAnnotationRange(selection)).toEqual({
      regionId: "reading-passage",
      root: region,
      start: 2,
      end: 9,
      text: "bold te",
    });

    const crossRange = document.createRange();
    crossRange.setStart(region.firstChild, 0);
    crossRange.setEnd(secondRegion.firstChild, 2);
    selection.removeAllRanges();
    selection.addRange(crossRange);
    expect(selectionToAnnotationRange(selection)).toBeNull();
  });

  it("rejects selections containing more than one native range", () => {
    const region = makeRegion();
    const range = document.createRange();
    range.selectNodeContents(region);
    const selection = {
      rangeCount: 2,
      isCollapsed: false,
      getRangeAt: vi.fn(() => range),
    };

    expect(selectionToAnnotationRange(selection)).toBeNull();
    expect(selection.getRangeAt).not.toHaveBeenCalled();
  });

  it("rejects a selection that crosses a nested annotation region", () => {
    const region = document.createElement("div");
    region.dataset.examAnnotationRegion = "outer";
    region.innerHTML = "before <span data-exam-annotation-region=\"inner\">inside</span> after";
    document.body.appendChild(region);
    const range = document.createRange();
    range.setStart(region.firstChild, 0);
    range.setEnd(region.lastChild, region.lastChild.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectionToAnnotationRange(selection)).toBeNull();
  });

  it("rejects collapsed and empty selections", () => {
    const region = makeRegion();
    const range = document.createRange();
    range.setStart(region.firstChild, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selectionToAnnotationRange(selection)).toBeNull();
  });
});

describe("exam annotation toolbar geometry", () => {
  const toolbar = { width: 160, height: 40 };
  const viewport = { width: 800, height: 600 };

  it("places the toolbar above the selection by default", () => {
    expect(getAnnotationToolbarPosition(
      { left: 300, right: 400, top: 300, bottom: 320 },
      toolbar,
      viewport,
    )).toEqual({ left: 270, top: 252, placement: "above" });
  });

  it("flips below when there is not enough room above", () => {
    expect(getAnnotationToolbarPosition(
      { left: 300, right: 400, top: 30, bottom: 50 },
      toolbar,
      viewport,
    )).toEqual({ left: 270, top: 58, placement: "below" });
  });

  it("clamps toolbar placement to the viewport gutter", () => {
    expect(getAnnotationToolbarPosition(
      { left: 0, right: 20, top: 300, bottom: 320 },
      { width: 200, height: 40 },
      { width: 320, height: 600 },
    )).toEqual({ left: 8, top: 252, placement: "above" });
    expect(getAnnotationToolbarPosition(
      { left: 310, right: 320, top: 300, bottom: 320 },
      { width: 200, height: 40 },
      { width: 320, height: 600 },
    )).toEqual({ left: 112, top: 252, placement: "above" });
  });
});
