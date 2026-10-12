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
  selectionToAnnotationRanges,
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

  it("returns one logical range for a registered single-region selection", () => {
    const region = makeRegion();
    const range = document.createRange();
    range.setStart(region.firstChild, 2);
    range.setEnd(region.querySelector("em").firstChild, 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    const registered = new Map([["reading-passage", region]]);
    expect(selectionToAnnotationRanges(selection, registered)).toEqual({
      ranges: [{
        regionId: "reading-passage",
        root: region,
        start: 2,
        end: 9,
        text: "bold te",
      }],
      text: "bold te",
    });
  });

  it("returns ordered partial, full, and partial ranges across one flow", () => {
    const first = document.createElement("span");
    const option = document.createElement("button");
    const second = document.createElement("span");
    const feedback = document.createElement("aside");
    const third = document.createElement("span");
    first.dataset.examAnnotationRegion = "first";
    second.dataset.examAnnotationRegion = "second";
    third.dataset.examAnnotationRegion = "third";
    first.dataset.examAnnotationFlow = "paragraph-1";
    second.dataset.examAnnotationFlow = "paragraph-1";
    third.dataset.examAnnotationFlow = "paragraph-1";
    first.textContent = "before";
    option.textContent = "answer";
    second.textContent = "middle";
    feedback.textContent = "correct";
    third.textContent = "after";
    document.body.append(first, option, second, feedback, third);

    const range = document.createRange();
    range.setStart(first.firstChild, 2);
    range.setEnd(third.firstChild, 3);
    const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range };
    const registered = new Map([
      ["first", first],
      ["second", second],
      ["third", third],
    ]);

    expect(selectionToAnnotationRanges(selection, registered)).toEqual({
      ranges: [
        { regionId: "first", root: first, start: 2, end: 6, text: "fore" },
        { regionId: "second", root: second, start: 0, end: 6, text: "middle" },
        { regionId: "third", root: third, start: 0, end: 3, text: "aft" },
      ],
      text: "foremiddleaft",
    });
  });

  it("omits an empty middle source root while retaining valid endpoints", () => {
    const first = document.createElement("span");
    const empty = document.createElement("span");
    const last = document.createElement("span");
    first.dataset.examAnnotationRegion = "first";
    empty.dataset.examAnnotationRegion = "empty";
    last.dataset.examAnnotationRegion = "last";
    first.dataset.examAnnotationFlow = "paragraph-1";
    empty.dataset.examAnnotationFlow = "paragraph-1";
    last.dataset.examAnnotationFlow = "paragraph-1";
    first.textContent = "left";
    last.textContent = "right";
    document.body.append(first, empty, last);

    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(last.firstChild, 3);
    const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range };
    const logicalSelection = selectionToAnnotationRanges(selection, new Map([
      ["first", first],
      ["empty", empty],
      ["last", last],
    ]));

    expect(logicalSelection.ranges.map(({ regionId }) => regionId)).toEqual(["first", "last"]);
    expect(logicalSelection.ranges.map(({ text }) => text)).toEqual(["eft", "rig"]);
  });

  it("skips registered roots without a flow id while selecting the shared flow", () => {
    const first = document.createElement("span");
    const option = document.createElement("span");
    const second = document.createElement("span");
    first.dataset.examAnnotationRegion = "first";
    second.dataset.examAnnotationRegion = "second";
    option.dataset.examAnnotationRegion = "option";
    first.dataset.examAnnotationFlow = "paragraph-1";
    second.dataset.examAnnotationFlow = "paragraph-1";
    first.textContent = "left";
    option.textContent = "choice";
    second.textContent = "right";
    document.body.append(first, option, second);

    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(second.firstChild, 4);
    const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range };
    const registered = new Map([
      ["first", first],
      ["option", option],
      ["second", second],
    ]);

    expect(selectionToAnnotationRanges(selection, registered).ranges.map(({ regionId }) => regionId))
      .toEqual(["first", "second"]);
  });

  it("rejects different flows, missing accepted fragments, nested foreign regions, and invalid selections", () => {
    const first = document.createElement("span");
    const missing = document.createElement("span");
    const second = document.createElement("span");
    first.dataset.examAnnotationRegion = "first";
    missing.dataset.examAnnotationRegion = "missing";
    second.dataset.examAnnotationRegion = "second";
    first.dataset.examAnnotationFlow = "paragraph-1";
    missing.dataset.examAnnotationFlow = "paragraph-1";
    second.dataset.examAnnotationFlow = "paragraph-2";
    first.textContent = "one";
    missing.textContent = "two";
    second.textContent = "three";
    document.body.append(first, missing, second);
    const range = document.createRange();
    range.setStart(first.firstChild, 0);
    range.setEnd(second.firstChild, 2);
    const selection = { rangeCount: 1, isCollapsed: false, getRangeAt: () => range };
    expect(selectionToAnnotationRanges(selection, new Map([
      ["first", first],
      ["second", second],
    ]))).toBeNull();

    const outer = document.createElement("span");
    const inner = document.createElement("span");
    outer.dataset.examAnnotationRegion = "outer";
    outer.dataset.examAnnotationFlow = "paragraph-3";
    inner.dataset.examAnnotationRegion = "inner";
    inner.textContent = "nested";
    outer.append("before ", inner, " after");
    document.body.append(outer);
    const nestedRange = document.createRange();
    nestedRange.selectNodeContents(outer);
    expect(selectionToAnnotationRanges(
      { rangeCount: 1, isCollapsed: false, getRangeAt: () => nestedRange },
      new Map([["outer", outer]]),
    )).toBeNull();

    const collapsed = document.createRange();
    collapsed.setStart(first.firstChild, 0);
    collapsed.collapse(true);
    expect(selectionToAnnotationRanges(
      { rangeCount: 1, isCollapsed: true, getRangeAt: () => collapsed },
      new Map([["first", first]]),
    )).toBeNull();
    expect(selectionToAnnotationRanges(
      { rangeCount: 2, isCollapsed: false, getRangeAt: () => range },
      new Map([["first", first], ["second", second]]),
    )).toBeNull();
  });

  it("rejects source roots wrapped by a foreign no-flow annotation ancestor", () => {
    const foreign = document.createElement("div");
    const first = document.createElement("span");
    const last = document.createElement("span");
    foreign.dataset.examAnnotationRegion = "foreign";
    first.dataset.examAnnotationRegion = "first";
    last.dataset.examAnnotationRegion = "last";
    first.dataset.examAnnotationFlow = "paragraph-1";
    last.dataset.examAnnotationFlow = "paragraph-1";
    first.textContent = "left";
    last.textContent = "right";
    foreign.append(first, document.createElement("button"), last);
    document.body.append(foreign);

    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(last.firstChild, 3);
    expect(selectionToAnnotationRanges(
      { rangeCount: 1, isCollapsed: false, getRangeAt: () => range },
      new Map([["first", first], ["last", last]]),
    )).toBeNull();
  });

  it("rejects a middle source root wrapped by a foreign no-flow annotation ancestor", () => {
    const first = document.createElement("span");
    const foreign = document.createElement("div");
    const middle = document.createElement("span");
    const last = document.createElement("span");
    first.dataset.examAnnotationRegion = "first";
    foreign.dataset.examAnnotationRegion = "foreign";
    middle.dataset.examAnnotationRegion = "middle";
    last.dataset.examAnnotationRegion = "last";
    first.dataset.examAnnotationFlow = "paragraph-1";
    middle.dataset.examAnnotationFlow = "paragraph-1";
    last.dataset.examAnnotationFlow = "paragraph-1";
    first.textContent = "left";
    middle.textContent = "middle";
    last.textContent = "right";
    foreign.append(middle);
    document.body.append(first, foreign, last);

    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(last.firstChild, 3);
    expect(selectionToAnnotationRanges(
      { rangeCount: 1, isCollapsed: false, getRangeAt: () => range },
      new Map([
        ["first", first],
        ["middle", middle],
        ["last", last],
      ]),
    )).toBeNull();
  });

  it("normalizes forward and backward selection direction to the same ranges", () => {
    const first = document.createElement("span");
    const second = document.createElement("span");
    first.dataset.examAnnotationRegion = "first";
    second.dataset.examAnnotationRegion = "second";
    first.dataset.examAnnotationFlow = "paragraph-1";
    second.dataset.examAnnotationFlow = "paragraph-1";
    first.textContent = "left";
    second.textContent = "right";
    document.body.append(first, second);
    const registered = new Map([["first", first], ["second", second]]);
    const selection = window.getSelection();
    const setDirection = (anchorNode, anchorOffset, focusNode, focusOffset) => {
      selection.removeAllRanges();
      if (typeof selection.setBaseAndExtent === "function") {
        selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
      } else {
        selection.collapse(anchorNode, anchorOffset);
        selection.extend(focusNode, focusOffset);
      }
      return selection;
    };
    const forwardSelection = setDirection(first.firstChild, 1, second.firstChild, 3);
    const forwardRanges = selectionToAnnotationRanges(forwardSelection, registered);
    const backwardSelection = setDirection(second.firstChild, 3, first.firstChild, 1);
    const backwardRanges = selectionToAnnotationRanges(backwardSelection, registered);

    expect(backwardSelection.anchorNode).toBe(second.firstChild);
    expect(backwardSelection.focusNode).toBe(first.firstChild);
    expect(backwardSelection.isCollapsed).toBe(false);
    expect(backwardRanges).toEqual(forwardRanges);
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
