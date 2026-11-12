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

function setup({ targetTag = "span" } = {}) {
  const view = render(<><div data-exam-annotation-region="region">
    {targetTag === "button" ? <button>ging</button> : <span>ging</span>}
  </div><DictionaryLookupOverlay /></>);
  const target = screen.getByText("ging");
  document.caretPositionFromPoint = () => ({ offsetNode: target.firstChild, offset: 2 });
  return { ...view, target };
}

function coarsePointer() {
  window.matchMedia = vi.fn((query) => ({ matches: query === "(pointer: coarse)" }));
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
    expect(setDictionaryFavorite).toHaveBeenCalledWith(4, true);
    expect(screen.getByRole("button", { name: "取消收藏" })).toHaveAttribute("aria-pressed", "true");
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
    const buttonView = render(<><div data-exam-annotation-region="button-region"><button>ging</button></div><DictionaryLookupOverlay /></>);
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
    expect(setDictionaryFavorite).toHaveBeenCalledWith(4, false);
  });

  it("debounces desktop movement and caches successful responses", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    setup();
    const region = screen.getByText("ging").closest("[data-exam-annotation-region]");
    fireEvent.pointerMove(region, { clientX: 1, clientY: 1 });
    await vi.advanceTimersByTimeAsync(299);
    expect(lookupDictionaryWord).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.runOnlyPendingTimersAsync();
    expect(lookupDictionaryWord).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(region, { clientX: 1, clientY: 1 });
    await vi.advanceTimersByTimeAsync(350);
    expect(lookupDictionaryWord).toHaveBeenCalledTimes(1);
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

  it("does not let an older response replace the latest word", async () => {
    let resolveOld;
    let resolveNew;
    lookupDictionaryWord
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
    render(<><div data-exam-annotation-region="first">ging</div>
      <div data-exam-annotation-region="second">gehen</div><DictionaryLookupOverlay /></>);
    const first = screen.getByText("ging");
    const second = screen.getByText("gehen");
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    document.caretPositionFromPoint = (x) => ({ offsetNode: x > 10 ? second.firstChild : first.firstChild, offset: 1 });
    fireEvent.pointerMove(first, { clientX: 1, clientY: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.pointerMove(second, { clientX: 20, clientY: 1 });
    await act(async () => {
      resolveOld({ matches: [{ id: 1, lemma: "ging", translation_zh: "旧" }] });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(300);
    });
    await act(async () => {
      resolveNew({ matches: [{ id: 2, lemma: "gehen", translation_zh: "新" }] });
      await Promise.resolve();
    });
    expect(screen.getByText("新")).toBeInTheDocument();
    expect(screen.queryByText("旧")).not.toBeInTheDocument();
  });
});
