import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { flushSync } from "react-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupDictionaryWord, setDictionaryFavorite } from "../../api/lexicon/dictionary.js";
import DictionaryLookupOverlay, { getWordAtCaret } from "./DictionaryLookupOverlay.jsx";

vi.mock("../../api/lexicon/dictionary.js", () => ({
  lookupDictionaryWord: vi.fn(),
  setDictionaryFavorite: vi.fn(),
}));

function wordAt(text, offset) {
  const root = document.createElement("span");
  root.textContent = text;
  return getWordAtCaret(root, root.firstChild, offset);
}

function setup({ targetTag = "span", regionAttribute = "data-dictionary-region", collectionKey } = {}) {
  const view = render(<><div {...{ [regionAttribute]: "region" }}>
    {targetTag === "button" ? <button>ging</button> : <span>ging</span>}
  </div><DictionaryLookupOverlay collectionKey={collectionKey} /></>);
  const target = screen.getByText("ging");
  document.caretPositionFromPoint = () => ({ offsetNode: target.firstChild, offset: 2 });
  return { ...view, target };
}

function coarsePointer() {
  window.matchMedia = vi.fn((query) => ({ matches: query === "(pointer: coarse)" }));
}

function setupVideoSubtitle() {
  const view = render(<><article><div data-dictionary-region="subtitle">
    <span>ging </span><button>gehen</button>
  </div></article><DictionaryLookupOverlay collectionKey="video:64" /></>);
  const word = screen.getByText("ging");
  const button = screen.getByRole("button", { name: "gehen" });
  document.caretPositionFromPoint = () => ({ offsetNode: word.firstChild, offset: 2 });
  return { ...view, word, button };
}

function setupAncestorButton() {
  const onClick = vi.fn();
  const view = render(<><button type="button" onClick={onClick}>
    <span data-dictionary-region="button-text">gehen</span>
  </button><DictionaryLookupOverlay collectionKey="exam:TELC:B2" /></>);
  const word = screen.getByText("gehen");
  const button = screen.getByRole("button", { name: "gehen" });
  document.caretPositionFromPoint = () => ({ offsetNode: word.firstChild, offset: 2 });
  return { ...view, word, button, onClick };
}

function AnnotationToolbarLookupHarness() {
  const [lookupRequest, setLookupRequest] = useState(null);
  return <>
    <div className="exam-text-annotation-toolbar">
      <button type="button" onClick={() => flushSync(() => setLookupRequest({
        id: 1, text: "gehen", anchor: { left: 40, bottom: 30 },
      }))}>查词</button>
    </div>
    <DictionaryLookupOverlay lookupRequest={lookupRequest} />
  </>;
}

describe("dictionary lookup word handling", () => {
  it("finds German inflections and compounds at a caret", () => {
    expect(wordAt("ging weiter", 2)).toBe("ging");
    expect(wordAt("Häusern", 4)).toBe("Häusern");
    expect(wordAt("E-Mail", 3)).toBe("E-Mail");
    expect(wordAt("geht's", 4)).toBe("geht's");
  });

  it("ignores punctuation, numbers, and Chinese-only words", () => {
    expect(wordAt("ging,", 4)).toBeNull();
    expect(wordAt("123", 1)).toBeNull();
    expect(wordAt("中文", 1)).toBeNull();
  });
});

describe("dictionary lookup overlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    coarsePointer();
    lookupDictionaryWord.mockResolvedValue({ matches: [{
      id: 4, matched_form: "ging", lemma: "gehen", translation_zh: "去", part_of_speech: "Verb",
      card: null,
    }] });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete document.caretPositionFromPoint;
    delete window.matchMedia;
  });

  it("looks up on touch and lets the learner favorite the match", async () => {
    setDictionaryFavorite.mockResolvedValue({ card: { id: 7, is_favorite: true } });
    setup();
    await act(async () => {
      fireEvent.pointerUp(screen.getByText("ging"), { pointerType: "touch", clientX: 1, clientY: 1 });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(screen.getByText("去")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "收藏" })); await Promise.resolve(); });
    expect(setDictionaryFavorite).toHaveBeenCalledWith(4, true, undefined);
    expect(screen.getByRole("button", { name: "取消收藏" })).toHaveAttribute("aria-pressed", "true");
  });

  it("accepts dictionary regions and carries their video collection key", async () => {
    setDictionaryFavorite.mockResolvedValue({ card: { id: 7, is_favorite: true } });
    setup({ regionAttribute: "data-dictionary-region", collectionKey: "video:7" });
    await act(async () => {
      fireEvent.pointerUp(screen.getByText("ging"), { pointerType: "touch", clientX: 1, clientY: 1 });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(lookupDictionaryWord).toHaveBeenCalledWith("ging", "video:7");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "收藏" })); await Promise.resolve(); });
    expect(setDictionaryFavorite).toHaveBeenCalledWith(4, true, "video:7");
  });

  it("looks up a trimmed selection request in the existing result panel", async () => {
    render(<DictionaryLookupOverlay
      collectionKey="exam:TELC:B2"
      lookupRequest={{
        id: 1,
        text: "  gehen  ",
        anchor: { left: 40, right: 80, top: 10, bottom: 30 },
      }}
      pointRegionSelector="[data-dictionary-region]"
    />);

    await act(async () => { await Promise.resolve(); });

    expect(lookupDictionaryWord).toHaveBeenCalledWith("gehen", "exam:TELC:B2");
    expect(screen.getByRole("dialog", { name: "词典查询：gehen" })).toHaveStyle({
      "--lookup-left": "40px",
      "--lookup-top": "38px",
    });
    expect(screen.getByText("去")).toBeInTheDocument();
  });

  it("keeps a lookup started by an annotation toolbar click alive", async () => {
    let resolveLookup;
    lookupDictionaryWord.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    render(<AnnotationToolbarLookupHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "查词" }));
      await Promise.resolve();
    });

    expect(screen.getByText("查询中…")).toBeInTheDocument();
    await act(async () => {
      resolveLookup({ matches: [{ id: 4, lemma: "gehen", translation_zh: "去" }] });
      await Promise.resolve();
    });

    expect(screen.getByText("去")).toBeInTheDocument();
    expect(screen.queryByText("查询中…")).not.toBeInTheDocument();
  });

  it.each(["zwei Wörter", "中文", "...", "   "])(
    "shows no result without an API request for invalid selection %j",
    async (text) => {
      render(<DictionaryLookupOverlay
        lookupRequest={{ id: 1, text, anchor: { left: 1, bottom: 2 } }}
        pointRegionSelector="[data-dictionary-region]"
      />);

      await act(async () => { await Promise.resolve(); });

      expect(lookupDictionaryWord).not.toHaveBeenCalled();
      expect(screen.getByText("未找到释义")).toBeInTheDocument();
    },
  );

  it("keeps an older selection response from replacing a newer request", async () => {
    let resolveOld;
    let resolveNew;
    lookupDictionaryWord
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    const view = render(<DictionaryLookupOverlay lookupRequest={{
      id: 1, text: "gehen", anchor: { left: 1, bottom: 2 },
    }} />);
    view.rerender(<DictionaryLookupOverlay lookupRequest={{
      id: 2, text: "kommen", anchor: { left: 3, bottom: 4 },
    }} />);

    await act(async () => {
      resolveOld({ matches: [{ id: 1, lemma: "gehen", translation_zh: "旧" }] });
      await Promise.resolve();
      resolveNew({ matches: [{ id: 2, lemma: "kommen", translation_zh: "新" }] });
      await Promise.resolve();
    });

    expect(screen.getByText("新")).toBeInTheDocument();
    expect(screen.queryByText("旧")).not.toBeInTheDocument();
  });

  it("portals the fixed panel outside transformed provider ancestors", async () => {
    const view = render(<div data-testid="transformed-provider" style={{ transform: "translateZ(0)" }}>
      <DictionaryLookupOverlay lookupRequest={{
        id: 1, text: "gehen", anchor: { left: 10, bottom: 20 },
      }} />
    </div>);
    await act(async () => { await Promise.resolve(); });

    const dialog = screen.getByRole("dialog", { name: "词典查询：gehen" });

    expect(view.container.querySelector(".dictionary-lookup-overlay")).toBeNull();
    expect(dialog.parentElement).toBe(document.body);
    expect(readFileSync(resolve("src/components/examPreparation/DictionaryLookupOverlay.css"), "utf8"))
      .toMatch(/\.dictionary-lookup-overlay\s*\{[^}]*position:\s*fixed/s);
    fireEvent.scroll(window);
    expect(dialog).toHaveStyle({ "--lookup-left": "10px", "--lookup-top": "28px" });
  });

  it("closes from an outside pointerdown even when the outside target stops propagation", async () => {
    render(<><button type="button" onPointerDown={(event) => event.stopPropagation()}>outside</button>
      <DictionaryLookupOverlay lookupRequest={{
        id: 1, text: "gehen", anchor: { left: 10, bottom: 20 },
      }} /></>);
    await act(async () => { await Promise.resolve(); });
    screen.getByRole("dialog", { name: "词典查询：gehen" });

    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from the header X button", async () => {
    render(<DictionaryLookupOverlay lookupRequest={{
      id: 1, text: "gehen", anchor: { left: 10, bottom: 20 },
    }} />);
    await act(async () => { await Promise.resolve(); });
    screen.getByRole("dialog", { name: "词典查询：gehen" });

    fireEvent.click(screen.getByRole("button", { name: "关闭词典查询" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the panel open for internal pointer and favorite actions", async () => {
    setDictionaryFavorite.mockResolvedValue({ card: { id: 7, is_favorite: true } });
    render(<DictionaryLookupOverlay collectionKey="exam:TELC:B2" lookupRequest={{
      id: 1, text: "gehen", anchor: { left: 10, bottom: 20 },
    }} />);
    await act(async () => { await Promise.resolve(); });
    const dialog = screen.getByRole("dialog", { name: "词典查询：gehen" });

    fireEvent.pointerDown(screen.getByRole("link", { name: "HanDeDict" }));
    expect(dialog).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "收藏" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "收藏" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("dialog", { name: "词典查询：gehen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消收藏" })).toBeInTheDocument();
  });

  it("ignores exam annotation point events when restricted to dictionary regions", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    render(<><span data-exam-annotation-region="exam">gehen</span>
      <DictionaryLookupOverlay pointRegionSelector="[data-dictionary-region]" /></>);
    const word = screen.getByText("gehen");
    document.caretPositionFromPoint = () => ({ offsetNode: word.firstChild, offset: 2 });

    fireEvent.pointerMove(word, { clientX: 1, clientY: 1 });
    await vi.advanceTimersByTimeAsync(300);
    fireEvent.click(word, { clientX: 1, clientY: 1 });
    await vi.runOnlyPendingTimersAsync();
    fireEvent.pointerUp(word, { pointerType: "touch", clientX: 1, clientY: 1 });
    await vi.runOnlyPendingTimersAsync();

    expect(lookupDictionaryWord).not.toHaveBeenCalled();
  });

  it("shows one compact HanDeDict license attribution for all matches", async () => {
    lookupDictionaryWord.mockResolvedValue({ matches: [
      { id: 4, lemma: "gehen", translation_zh: "去" },
      { id: 5, lemma: "gehen", translation_zh: "行走" },
    ] });
    setup();
    await act(async () => {
      fireEvent.pointerUp(screen.getByText("ging"), { pointerType: "touch", clientX: 1, clientY: 1 });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });

    expect(document.querySelector(".dictionary-lookup-attribution").textContent)
      .toContain("补充词条使用 HanDeDict中德词典反向生成并经严格过滤。许可：CC BY-SA 3.0。");
    expect(screen.getAllByRole("link", { name: "HanDeDict" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "HanDeDict" })).toHaveAttribute("href", "https://github.com/gugray/HanDeDict");
    expect(screen.getByRole("link", { name: "CC BY-SA 3.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/3.0/");
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("uses DELETE for an existing favorite and ignores touch selection and interactive targets", async () => {
    lookupDictionaryWord.mockResolvedValue({ matches: [{
      id: 4, matched_form: "ging", lemma: "gehen", translation_zh: "去", card: { id: 7, is_favorite: true },
    }] });
    setDictionaryFavorite.mockResolvedValue({ card: { id: 7, is_favorite: false } });
    const { target } = setup();
    window.getSelection = () => ({ isCollapsed: false });
    fireEvent.pointerUp(target, { pointerType: "touch" });
    expect(lookupDictionaryWord).not.toHaveBeenCalled();
    window.getSelection = () => ({ isCollapsed: true });
    const buttonView = render(<><div data-dictionary-region="button-region"><button>ging</button></div><DictionaryLookupOverlay /></>);
    fireEvent.pointerUp(screen.getByRole("button", { name: "ging" }), { pointerType: "touch" });
    expect(lookupDictionaryWord).not.toHaveBeenCalled();
    buttonView.unmount();
    await act(async () => {
      fireEvent.pointerUp(target, { pointerType: "touch" });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "取消收藏" }));
    await act(async () => { await Promise.resolve(); });
    expect(setDictionaryFavorite).toHaveBeenCalledWith(4, false, undefined);
  });

  it("opens ordinary desktop text only on click and caches successful responses", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    const { target } = setup();
    const region = screen.getByText("ging").closest("[data-dictionary-region]");
    fireEvent.pointerMove(region, { clientX: 1, clientY: 1 });
    await vi.advanceTimersByTimeAsync(300);
    expect(lookupDictionaryWord).not.toHaveBeenCalled();
    fireEvent.click(target, { clientX: 1, clientY: 1 });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(lookupDictionaryWord).toHaveBeenCalledTimes(1);
    fireEvent.click(target, { clientX: 1, clientY: 1 });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(lookupDictionaryWord).toHaveBeenCalledTimes(1);
  });

  it("looks up interactive desktop text on hover without canceling its click", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    const { button } = setupVideoSubtitle();
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    document.caretPositionFromPoint = () => ({ offsetNode: button.firstChild, offset: 2 });

    fireEvent.pointerMove(button, { clientX: 1, clientY: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(lookupDictionaryWord).toHaveBeenCalledWith("gehen", "video:64");
    fireEvent.click(button, { clientX: 1, clientY: 1 });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("looks up a dictionary region nested inside a desktop control on hover", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    const { word } = setupAncestorButton();

    fireEvent.pointerMove(word, { clientX: 1, clientY: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(lookupDictionaryWord).toHaveBeenCalledWith("gehen", "exam:TELC:B2");
  });

  it("cancels an in-flight interactive hover lookup after moving to ordinary text", async () => {
    let resolveLookup;
    lookupDictionaryWord.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    const { word, button } = setupVideoSubtitle();
    document.caretPositionFromPoint = () => ({ offsetNode: button.firstChild, offset: 2 });

    fireEvent.pointerMove(button, { clientX: 1, clientY: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(lookupDictionaryWord).toHaveBeenCalledWith("gehen", "video:64");
    expect(screen.getByRole("dialog", { name: "词典查询：gehen" })).toBeInTheDocument();

    document.caretPositionFromPoint = () => ({ offsetNode: word.firstChild, offset: 2 });
    fireEvent.pointerMove(word, { clientX: 2, clientY: 1 });
    await act(async () => {
      resolveLookup({ matches: [{ id: 4, lemma: "gehen", translation_zh: "去" }] });
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("去")).not.toBeInTheDocument();
  });

  it("keeps an in-flight ordinary click lookup after slight pointer movement", async () => {
    let resolveLookup;
    lookupDictionaryWord.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    const { target } = setup();

    fireEvent.click(target, { clientX: 1, clientY: 1 });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    fireEvent.pointerMove(target, { clientX: 2, clientY: 1 });
    await act(async () => {
      resolveLookup({ matches: [{ id: 4, lemma: "gehen", translation_zh: "去" }] });
      await Promise.resolve();
    });

    expect(screen.getByText("去")).toBeInTheDocument();
  });

  it("keeps a completed hover lookup while crossing background into the overlay", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    render(<div data-testid="lookup-background">background</div>);
    const { word, button } = setupVideoSubtitle();
    document.caretPositionFromPoint = () => ({ offsetNode: button.firstChild, offset: 2 });

    fireEvent.pointerMove(button, { clientX: 1, clientY: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });
    expect(screen.getByText("去")).toBeInTheDocument();

    fireEvent.pointerMove(screen.getByTestId("lookup-background"));
    const dialog = screen.getByRole("dialog", { name: "词典查询：gehen" });
    expect(dialog).toBeInTheDocument();
    fireEvent.pointerMove(dialog);
    expect(dialog).toBeInTheDocument();

    fireEvent.pointerMove(word, { clientX: 2, clientY: 1 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("looks up ordinary subtitle text on touch outside a button-like row", async () => {
    const { word } = setupVideoSubtitle();
    await act(async () => {
      fireEvent.pointerUp(word, { pointerType: "touch", clientX: 1, clientY: 1 });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(lookupDictionaryWord).toHaveBeenCalledWith("ging", "video:64");
  });

  it("ignores a nested subtitle button on touch", async () => {
    const { button } = setupVideoSubtitle();
    fireEvent.pointerUp(button, { pointerType: "touch", clientX: 1, clientY: 1 });
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(lookupDictionaryWord).not.toHaveBeenCalled();
  });

  it("keeps a short touch tap on an interactive target as its normal click", async () => {
    const { button } = setupVideoSubtitle();
    const onClick = vi.fn();
    button.addEventListener("click", onClick);

    fireEvent.pointerDown(button, {
      pointerType: "touch", pointerId: 3, clientX: 10, clientY: 10,
    });
    await vi.advanceTimersByTimeAsync(300);
    fireEvent.pointerUp(button, {
      pointerType: "touch", pointerId: 3, clientX: 10, clientY: 10,
    });
    fireEvent.click(button);

    expect(lookupDictionaryWord).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps a short touch tap when the dictionary region is nested inside the control", async () => {
    const { word, button, onClick } = setupAncestorButton();

    fireEvent.pointerDown(word, {
      pointerType: "touch", pointerId: 7, clientX: 10, clientY: 10,
    });
    await vi.advanceTimersByTimeAsync(300);
    fireEvent.pointerUp(word, {
      pointerType: "touch", pointerId: 7, clientX: 10, clientY: 10,
    });
    fireEvent.click(button);

    expect(lookupDictionaryWord).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("looks up an interactive word on touch long press and suppresses its click", async () => {
    const { button } = setupVideoSubtitle();
    const onClick = vi.fn();
    button.addEventListener("click", onClick);
    document.caretPositionFromPoint = () => ({ offsetNode: button.firstChild, offset: 2 });

    fireEvent.pointerDown(button, {
      pointerType: "touch", pointerId: 4, clientX: 10, clientY: 10,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(lookupDictionaryWord).toHaveBeenCalledWith("gehen", "video:64");
    expect(screen.getByText("去")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1500);
    fireEvent.pointerUp(button, {
      pointerType: "touch", pointerId: 4, clientX: 10, clientY: 10,
    });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("long-presses a dictionary region nested inside a control and suppresses the ancestor click", async () => {
    const { word, button, onClick } = setupAncestorButton();

    fireEvent.pointerDown(word, {
      pointerType: "touch", pointerId: 8, clientX: 10, clientY: 10,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(501);
      await Promise.resolve();
    });

    expect(lookupDictionaryWord).toHaveBeenCalledWith("gehen", "exam:TELC:B2");
    fireEvent.pointerUp(word, {
      pointerType: "touch", pointerId: 8, clientX: 10, clientY: 10,
    });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(["move", "cancel"])("cancels an interactive long press on pointer %s", async (reason) => {
    const { button } = setupVideoSubtitle();
    document.caretPositionFromPoint = () => ({ offsetNode: button.firstChild, offset: 2 });

    fireEvent.pointerDown(button, {
      pointerType: "touch", pointerId: 5, clientX: 10, clientY: 10,
    });
    if (reason === "move") {
      fireEvent.pointerMove(button, {
        pointerType: "touch", pointerId: 5, clientX: 21, clientY: 10,
      });
    } else {
      fireEvent.pointerCancel(button, { pointerType: "touch", pointerId: 5 });
    }
    await vi.advanceTimersByTimeAsync(500);

    expect(lookupDictionaryWord).not.toHaveBeenCalled();
  });

  it("cancels an interactive long press when text is selected", async () => {
    const { button } = setupVideoSubtitle();
    const getSelection = window.getSelection;
    window.getSelection = () => ({ isCollapsed: false });

    fireEvent.pointerDown(button, {
      pointerType: "touch", pointerId: 6, clientX: 10, clientY: 10,
    });
    await vi.advanceTimersByTimeAsync(500);
    window.getSelection = getSelection;

    expect(lookupDictionaryWord).not.toHaveBeenCalled();
  });

  it("shows a no-result state", async () => {
    lookupDictionaryWord.mockResolvedValue({ matches: [] });
    setup();
    await act(async () => {
      fireEvent.pointerUp(screen.getByText("ging"), { pointerType: "touch" });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(screen.getByText("未找到释义")).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    lookupDictionaryWord.mockRejectedValue(new Error("offline"));
    setup();
    await act(async () => {
      fireEvent.pointerUp(screen.getByText("ging"), { pointerType: "touch" });
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(screen.getByText("查询失败")).toBeInTheDocument();
  });

  it("turns a stalled valid lookup into an explicit failure and ignores its late response", async () => {
    let resolveLookup;
    lookupDictionaryWord.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    render(<DictionaryLookupOverlay lookupRequest={{
      id: 1, text: "Vorteile", anchor: { left: 10, bottom: 20 },
    }} />);
    expect(screen.getByText("查询中…")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByText("查询失败")).toBeInTheDocument();

    await act(async () => {
      resolveLookup({ matches: [{ id: 9, lemma: "Vorteil", translation_zh: "优点" }] });
      await Promise.resolve();
    });
    expect(screen.getByText("查询失败")).toBeInTheDocument();
    expect(screen.queryByText("优点")).not.toBeInTheDocument();
  });

  it("does not let an older response replace the latest word", async () => {
    let resolveOld;
    let resolveNew;
    lookupDictionaryWord
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    render(<><div data-dictionary-region="first">ging</div>
      <div data-dictionary-region="second">gehen</div><DictionaryLookupOverlay /></>);
    const first = screen.getByText("ging");
    const second = screen.getByText("gehen");
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    document.caretPositionFromPoint = (x) => ({ offsetNode: x > 10 ? second.firstChild : first.firstChild, offset: 1 });
    fireEvent.click(first, { clientX: 1, clientY: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(second, { clientX: 20, clientY: 1 });
    await act(async () => {
      resolveOld({ matches: [{ id: 1, lemma: "ging", translation_zh: "旧" }] });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      resolveNew({ matches: [{ id: 2, lemma: "gehen", translation_zh: "新" }] });
      await Promise.resolve();
    });
    expect(screen.getByText("新")).toBeInTheDocument();
    expect(screen.queryByText("旧")).not.toBeInTheDocument();
  });
});
