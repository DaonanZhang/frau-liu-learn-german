import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AnnotatableTextRegion,
  ExamTextAnnotationProvider,
  useExamTextAnnotations,
} from "./ExamTextAnnotations.jsx";

function FakeHighlight(...ranges) {
  this.ranges = ranges;
}

function SelectableRegion({ id = "passage", as = "span", flowId, children = "The passage" }) {
  return (
    <AnnotatableTextRegion regionId={id} as={as} flowId={flowId}>
      {children}
    </AnnotatableTextRegion>
  );
}

function mount(children, props = {}) {
  return render(
    <ExamTextAnnotationProvider scope="exam-annotations:v1:exercise:READING:1" {...props}>
      {children}
    </ExamTextAnnotationProvider>,
  );
}

function selectText(element, start, end) {
  const range = document.createRange();
  range.setStart(element.firstChild, start);
  range.setEnd(element.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function ClearButton() {
  const { clearAnnotations } = useExamTextAnnotations();
  return <button type="button" onClick={clearAnnotations}>clear-state</button>;
}

describe("exam text annotation controller", () => {
  let registry;

  beforeEach(() => {
    registry = new Map();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: registry };
    sessionStorage.clear();
  });

  afterEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll("style[data-exam-text-annotation-style]").forEach((style) => style.remove());
    delete document.caretPositionFromPoint;
    delete document.caretRangeFromPoint;
    delete window.Highlight;
    delete window.CSS;
  });

  it("registers a stable region id on the chosen semantic element", () => {
    mount(<SelectableRegion id="question:42" as="p">Question text</SelectableRegion>);

    const region = screen.getByText("Question text");
    expect(region.tagName).toBe("P");
    expect(region).toHaveAttribute("data-exam-annotation-region", "question:42");
  });

  it("renders an optional flow id without changing the semantic element", () => {
    mount(<SelectableRegion id="source" flowId="part-1" as="p">Source text</SelectableRegion>);

    const region = screen.getByText("Source text");
    expect(region.tagName).toBe("P");
    expect(region).toHaveAttribute("data-exam-annotation-flow", "part-1");
  });

  it("opens a toolbar for a valid single-region selection", async () => {
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));

    expect(await screen.findByRole("button", { name: "高亮" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下划线" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除" })).toBeInTheDocument();
  });

  it("opens one toolbar for a selection spanning registered roots in one flow", async () => {
    mount(
      <>
        <SelectableRegion id="first" flowId="part-1">before</SelectableRegion>
        <SelectableRegion id="option" as="button">choice</SelectableRegion>
        <SelectableRegion id="second" flowId="part-1">after</SelectableRegion>
      </>,
    );
    const first = screen.getByText("before");
    const second = screen.getByText("after");
    const range = document.createRange();
    range.setStart(first.firstChild, 2);
    range.setEnd(second.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));

    expect(await screen.findByRole("button", { name: "高亮" })).toBeInTheDocument();
  });

  it("applies a mixed style to every selected source root in one state commit", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount(
      <>
        <SelectableRegion id="first" flowId="part-1">before</SelectableRegion>
        <SelectableRegion id="option" as="button">choice</SelectableRegion>
        <SelectableRegion id="second" flowId="part-1">after</SelectableRegion>
      </>,
    );
    const first = screen.getByText("before");
    const second = screen.getByText("after");
    selectText(first, 0, 2);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));

    const range = document.createRange();
    range.setStart(first.firstChild, 0);
    range.setEnd(second.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    const highlight = await screen.findByRole("button", { name: "高亮" });
    expect(highlight).toHaveAttribute("aria-pressed", "mixed");

    setItem.mockClear();
    fireEvent.click(highlight);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).regions)
      .toEqual({
        first: [{ start: 0, end: 6, highlight: true, underline: false }],
        second: [{ start: 0, end: 3, highlight: true, underline: false }],
      });
    setItem.mockRestore();
  });

  it("removes and clears styles across every selected source root", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount(
      <>
        <SelectableRegion id="first" flowId="part-1">before</SelectableRegion>
        <SelectableRegion id="option" as="button">choice</SelectableRegion>
        <SelectableRegion id="second" flowId="part-1">after</SelectableRegion>
      </>,
    );
    const first = screen.getByText("before");
    const second = screen.getByText("after");
    const selectFlow = () => {
      const range = document.createRange();
      range.setStart(first.firstChild, 0);
      range.setEnd(second.firstChild, 5);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    };

    selectFlow();
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    setItem.mockClear();
    selectFlow();
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).regions)
      .toEqual({ first: [], second: [] });

    selectFlow();
    fireEvent.click(await screen.findByRole("button", { name: "下划线" }));
    setItem.mockClear();
    selectFlow();
    fireEvent.click(await screen.findByRole("button", { name: "清除" }));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).regions)
      .toEqual({ first: [], second: [] });
    setItem.mockRestore();
  });

  it("suppresses one generated option click when selection starts in a sibling source root", async () => {
    const clicked = vi.fn();
    mount(
      <>
        <SelectableRegion id="first" flowId="part-1">before</SelectableRegion>
        <button type="button" data-testid="option" onClick={clicked}>choice</button>
        <SelectableRegion id="second" flowId="part-1">after</SelectableRegion>
      </>,
    );
    const first = screen.getByText("before");
    const second = screen.getByText("after");
    const option = screen.getByTestId("option");
    fireEvent.pointerDown(first, { pointerId: 41 });
    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(second.firstChild, 4);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(option, { pointerId: 41 });
    await screen.findByRole("button", { name: "高亮" });

    fireEvent.click(option);
    expect(clicked).not.toHaveBeenCalled();
    fireEvent.click(option);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("keeps generated-click suppression bound to a cross-flow selection signature", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option" onClick={clicked}>
        <SelectableRegion id="first" flowId="part-1">before</SelectableRegion>
        <SelectableRegion id="choice">choice</SelectableRegion>
        <SelectableRegion id="second" flowId="part-1">after</SelectableRegion>
      </button>,
    );
    const option = screen.getByTestId("option");
    const first = screen.getByText("before");
    const second = screen.getByText("after");
    fireEvent.pointerDown(option, { pointerId: 31 });
    const range = document.createRange();
    range.setStart(first.firstChild, 1);
    range.setEnd(second.firstChild, 4);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(option, { pointerId: 31 });
    await screen.findByRole("button", { name: "高亮" });

    fireEvent.click(option);
    expect(clicked).not.toHaveBeenCalled();
    fireEvent.click(option);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does not open for collapsed, outside, or cross-region selections", () => {
    mount(
      <>
        <SelectableRegion id="first" />
        <SelectableRegion id="second" />
      </>,
    );
    const first = screen.getByText("The passage", { selector: '[data-exam-annotation-region="first"]' });
    const second = screen.getByText("The passage", { selector: '[data-exam-annotation-region="second"]' });
    const selection = window.getSelection();
    const range = document.createRange();

    range.setStart(first.firstChild, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();

    range.setStart(first.firstChild, 0);
    range.setEnd(second.firstChild, 3);
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();
  });

  it("applies independent styles and exposes mixed aria-pressed state", async () => {
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerDown(await screen.findByRole("button", { name: "高亮" }));
    fireEvent.click(screen.getByRole("button", { name: "高亮" }));

    selectText(region, 0, 5);
    document.dispatchEvent(new Event("selectionchange"));
    const underline = await screen.findByRole("button", { name: "下划线" });
    expect(underline).toHaveAttribute("aria-pressed", "false");
    fireEvent.pointerDown(underline);
    fireEvent.click(underline);

    selectText(region, 0, 5);
    document.dispatchEvent(new Event("selectionchange"));
    expect(await screen.findByRole("button", { name: "高亮" })).toHaveAttribute("aria-pressed", "mixed");
    expect(screen.getByRole("button", { name: "下划线" })).toHaveAttribute("aria-pressed", "true");
  });

  it("dismisses without changing annotations on Escape, outside click, leave, or scroll", async () => {
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();

    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.pointerLeave(region);
    fireEvent.scroll(window);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();
  });

  it("keeps an outside pointer gesture from reopening a dismissed toolbar", async () => {
    mount(
      <>
        <SelectableRegion />
        <div data-testid="outside-target">Outside</div>
      </>,
    );
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    await screen.findByRole("button", { name: "高亮" });

    const outside = screen.getByTestId("outside-target");
    fireEvent.pointerDown(outside, { pointerId: 20 });
    fireEvent.pointerUp(outside, { pointerId: 20 });
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();

    fireEvent.pointerDown(region, { pointerId: 21 });
    selectText(region, 0, 4);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(region, { pointerId: 21 });
    expect(await screen.findByRole("button", { name: "高亮" })).toBeInTheDocument();
  });

  it("opens a complete stored segment when a marked region is activated", async () => {
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));

    document.caretPositionFromPoint = () => ({ offsetNode: region.firstChild, offset: 1 });
    fireEvent.pointerUp(region, { clientX: 4, clientY: 4 });

    expect(await screen.findByRole("button", { name: "高亮" })).toHaveAttribute("aria-pressed", "true");
  });

  it("removes its custom highlight registry entries on unmount", () => {
    const view = mount(<SelectableRegion />);
    expect(registry.size).toBe(2);
    expect(document.head.querySelectorAll("style[data-exam-text-annotation-style]")).toHaveLength(1);
    view.unmount();
    expect(registry.size).toBe(0);
    expect(document.head.querySelectorAll("style[data-exam-text-annotation-style]")).toHaveLength(0);
  });

  it("leaves native selection alone and renders no toolbar without custom highlights", () => {
    delete window.Highlight;
    window.CSS = { highlights: new Map() };
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    expect(window.getSelection().toString()).toBe("The");
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();
  });

  it("clears memory, registry ranges, and the active scope key", async () => {
    mount(
      <>
        <SelectableRegion />
        <ClearButton />
      </>,
    );
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).regions.passage)
      .toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "clear-state" }));
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).toBeNull();
    expect([...registry.values()].every((highlight) => highlight.ranges.length === 0)).toBe(true);
  });

  it("does not read or write storage for a null scope", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    mount(<SelectableRegion />, { scope: null });
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("drops stale offsets after region text changes instead of clamping them", async () => {
    const view = mount(<SelectableRegion>Long source text</SelectableRegion>);
    const region = screen.getByText("Long source text");
    selectText(region, 0, 8);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    view.rerender(
      <ExamTextAnnotationProvider scope="exam-annotations:v1:exercise:READING:1">
        <SelectableRegion>Short</SelectableRegion>
      </ExamTextAnnotationProvider>,
    );
    await waitFor(() => {
      const state = JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1"));
      expect(state.regions.passage || []).toEqual([]);
    });
  });

  it("keeps a marked segment active through toolbar pointerup before applying underline", async () => {
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    fireEvent.pointerDown(region);
    selectText(region, 0, 3);
    fireEvent.pointerUp(region);
    const highlight = await screen.findByRole("button", { name: "高亮" });
    fireEvent.pointerDown(highlight);
    fireEvent.pointerUp(highlight);
    fireEvent.click(highlight);

    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    const underline = await screen.findByRole("button", { name: "下划线" });
    fireEvent.pointerDown(underline);
    fireEvent.pointerUp(underline);
    fireEvent.click(underline);

    expect(JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).regions.passage)
      .toEqual([{ start: 0, end: 3, highlight: true, underline: true }]);
  });

  it("re-measures the active range after scroll and resize without deleting its mark", async () => {
    const view = mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    let rect = { left: 100, right: 160, top: 180, bottom: 200 };
    const originalCreateRange = document.createRange.bind(document);
    const createRange = vi.spyOn(document, "createRange").mockImplementation(() => {
      const range = originalCreateRange();
      range.getBoundingClientRect = () => rect;
      return range;
    });
    fireEvent.pointerDown(region);
    selectText(region, 0, 3);
    fireEvent.pointerUp(region);
    const highlight = await screen.findByRole("button", { name: "高亮" });
    fireEvent.click(highlight);

    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    await screen.findByRole("toolbar");

    rect = { left: 420, right: 480, top: 280, bottom: 300 };
    fireEvent.scroll(window);
    fireEvent.resize(window);

    expect(screen.getByRole("toolbar")).toHaveStyle({ left: "450px" });
    expect(JSON.parse(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).regions.passage)
      .toEqual([{ start: 0, end: 3, highlight: true, underline: false }]);
    view.unmount();
    createRange.mockRestore();
  });

  it("suppresses only the generated interactive click for the matching pointer gesture", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option-a" onClick={clicked}>
        <SelectableRegion id="option-a-label" />
      </button>,
    );
    const option = screen.getByTestId("option-a");
    const region = screen.getByText("The passage");
    fireEvent.pointerDown(option, { pointerId: 12 });
    selectText(region, 0, 3);
    fireEvent.pointerUp(option, { pointerId: 12 });
    expect(await screen.findByRole("button", { name: "高亮" })).toBeInTheDocument();

    fireEvent.click(option);
    expect(clicked).not.toHaveBeenCalled();
    fireEvent.click(option);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("suppresses a generated click when selection changes and returns to its initial range", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option-a" onClick={clicked}>
        <SelectableRegion id="option-a-label" />
      </button>,
    );
    const option = screen.getByTestId("option-a");
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));

    fireEvent.pointerDown(option, { pointerId: 15 });
    window.getSelection().removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(option, { pointerId: 15 });
    await screen.findByRole("button", { name: "高亮" });

    fireEvent.click(option);
    expect(clicked).not.toHaveBeenCalled();

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(option, { pointerId: 16 });
    fireEvent.pointerUp(option, { pointerId: 16 });
    fireEvent.click(option);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("suppresses a generated click from an option label but allows the next ordinary click", async () => {
    const changed = vi.fn();
    mount(
      <label htmlFor="option-a-input">
        <input id="option-a-input" type="radio" name="answer" onChange={changed} />
        <SelectableRegion id="option-a-label" />
      </label>,
    );
    const input = screen.getByRole("radio");
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));

    fireEvent.pointerDown(region, { pointerId: 17 });
    selectText(region, 0, 5);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.pointerUp(region, { pointerId: 17 });
    await screen.findByRole("button", { name: "高亮" });

    fireEvent.click(region);
    expect(input).not.toBeChecked();
    expect(changed).not.toHaveBeenCalled();

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(region, { pointerId: 18 });
    fireEvent.pointerUp(region, { pointerId: 18 });
    fireEvent.click(region);
    expect(input).toBeChecked();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("does not suppress a click when a selection drag crosses option labels", async () => {
    const changed = vi.fn();
    mount(
      <>
        <label htmlFor="option-a-input">
          <input id="option-a-input" type="radio" name="answer" />
          <SelectableRegion id="option-a-label" />
        </label>
        <label htmlFor="option-b-input">
          <input id="option-b-input" type="radio" name="answer" onChange={changed} />
          <SelectableRegion id="option-b-label">Other answer</SelectableRegion>
        </label>
      </>,
    );
    const regionA = screen.getByText("The passage");
    const regionB = screen.getByText("Other answer");
    const inputB = screen.getByRole("radio", { name: "Other answer" });
    fireEvent.pointerDown(regionA, { pointerId: 19 });
    selectText(regionA, 0, 3);
    fireEvent.pointerUp(regionB, { pointerId: 19 });
    fireEvent.click(regionB);

    expect(inputB).toBeChecked();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("suppresses the generated click when pointerId is unavailable", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option-a" onClick={clicked}>
        <SelectableRegion id="option-a-label" />
      </button>,
    );
    const option = screen.getByTestId("option-a");
    const region = screen.getByText("The passage");

    fireEvent.pointerDown(option);
    selectText(region, 0, 3);
    fireEvent.pointerUp(option);
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.click(option);
    expect(clicked).not.toHaveBeenCalled();

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does not suppress keyboard selections or clicks on a different target", async () => {
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    mount(
      <>
        <button type="button" data-testid="option-a" onClick={firstClick}>
          <SelectableRegion id="option-a-label" />
        </button>
        <button type="button" data-testid="option-b" onClick={secondClick}>Other</button>
      </>,
    );
    const region = screen.getByText("The passage");
    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    expect(await screen.findByRole("button", { name: "高亮" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("option-a"));
    expect(firstClick).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByTestId("option-a"));
    selectText(region, 0, 3);
    fireEvent.pointerUp(screen.getByTestId("option-a"));
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.click(screen.getByTestId("option-b"));
    expect(secondClick).toHaveBeenCalledTimes(1);
  });

  it("does not suppress when pointer ids differ across the gesture", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option-a" onClick={clicked}>
        <SelectableRegion id="option-a-label" />
      </button>,
    );
    const option = screen.getByTestId("option-a");
    const region = screen.getByText("The passage");

    fireEvent.pointerDown(option, { pointerId: 13 });
    selectText(region, 0, 3);
    fireEvent.pointerUp(option, { pointerId: 14 });
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.click(option);

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("does not suppress B when a keyboard selection in A is kept during B pointerup", async () => {
    const aClick = vi.fn();
    const bClick = vi.fn();
    mount(
      <>
        <button type="button" data-testid="option-a" onClick={aClick}>A</button>
        <button type="button" data-testid="option-b" onClick={bClick}>B</button>
        <SelectableRegion id="keyboard-source" />
      </>,
    );
    const source = screen.getByText("The passage");
    selectText(source, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));

    const optionB = screen.getByTestId("option-b");
    fireEvent.pointerDown(optionB, { pointerId: 7 });
    fireEvent.pointerUp(optionB, { pointerId: 7 });
    fireEvent.click(optionB);

    expect(bClick).toHaveBeenCalledTimes(1);
  });

  it("expires suppression when a drag selection produces no generated click", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option-a" onClick={clicked}>
        <SelectableRegion id="option-a-label" />
      </button>,
    );
    const option = screen.getByTestId("option-a");
    const region = screen.getByText("The passage");
    fireEvent.pointerDown(option, { pointerId: 8 });
    selectText(region, 0, 3);
    fireEvent.pointerUp(option, { pointerId: 8 });
    await screen.findByRole("button", { name: "高亮" });

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(option, { pointerId: 9 });
    fireEvent.pointerUp(option, { pointerId: 9 });
    fireEvent.click(option);

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("suppresses one generated click and allows the next complete ordinary pointer gesture", async () => {
    const clicked = vi.fn();
    mount(
      <button type="button" data-testid="option-a" onClick={clicked}>
        <SelectableRegion id="option-a-label" />
      </button>,
    );
    const option = screen.getByTestId("option-a");
    const region = screen.getByText("The passage");
    fireEvent.pointerDown(option, { pointerId: 10 });
    selectText(region, 0, 3);
    fireEvent.pointerUp(option, { pointerId: 10 });
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.click(option);
    expect(clicked).not.toHaveBeenCalled();

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(option, { pointerId: 11 });
    fireEvent.pointerUp(option, { pointerId: 11 });
    fireEvent.click(option);

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("keeps persisted marks when Escape, outside click, pointer leave, and scroll dismiss the toolbar", async () => {
    mount(<SelectableRegion />);
    const region = screen.getByText("The passage");
    fireEvent.pointerDown(region);
    selectText(region, 0, 3);
    fireEvent.pointerUp(region);
    const highlight = await screen.findByRole("button", { name: "高亮" });
    fireEvent.pointerDown(highlight);
    fireEvent.pointerUp(highlight);
    fireEvent.click(highlight);
    const stored = sessionStorage.getItem("exam-annotations:v1:exercise:READING:1");

    document.caretPositionFromPoint = () => ({ offsetNode: region.firstChild, offset: 1 });
    fireEvent.pointerDown(region);
    fireEvent.pointerUp(region, { clientX: 2, clientY: 2 });
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.pointerLeave(region);
    fireEvent.scroll(window);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).toBe(stored);
    expect([...registry.values()].some((highlightEntry) => highlightEntry.ranges.length === 1)).toBe(true);

    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    await screen.findByRole("button", { name: "高亮" });
    fireEvent.pointerDown(document.body);
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:READING:1")).toBe(stored);
  });

  it("isolates throwing Custom Highlight and registry operations from children", () => {
    class ThrowingHighlight {
      constructor() {
        throw new Error("highlight unavailable");
      }
    }
    window.Highlight = ThrowingHighlight;
    window.CSS = {
      highlights: {
        set: () => { throw new Error("registry unavailable"); },
        delete: () => { throw new Error("registry unavailable"); },
      },
    };

    expect(() => mount(<SelectableRegion />)).not.toThrow();
    expect(screen.getByText("The passage")).toBeInTheDocument();
    fireEvent.click(screen.getByText("The passage"));
    expect(screen.getByText("The passage")).toBeInTheDocument();
  });

  it("keeps null-scope marks editable in memory without session storage", async () => {
    mount(<SelectableRegion />, { scope: null });
    const region = screen.getByText("The passage");
    fireEvent.pointerDown(region);
    selectText(region, 0, 3);
    fireEvent.pointerUp(region);
    const highlight = await screen.findByRole("button", { name: "高亮" });
    fireEvent.click(highlight);
    expect(sessionStorage.length).toBe(0);

    selectText(region, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    expect(await screen.findByRole("button", { name: "高亮" })).toHaveAttribute("aria-pressed", "true");
  });

  it("removes only stale mounted segments while retaining valid ones", async () => {
    const scope = "exam-annotations:v1:exercise:READING:1";
    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: {
        passage: [
          { start: 0, end: 3, highlight: true, underline: false },
          { start: 4, end: 99, highlight: false, underline: true },
        ],
      },
    }));
    mount(<SelectableRegion />);

    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem(scope)).regions.passage)
        .toEqual([{ start: 0, end: 3, highlight: true, underline: false }]);
    });
    expect([...registry.values()].some((highlightEntry) => highlightEntry.ranges.length === 1)).toBe(true);
  });
});
