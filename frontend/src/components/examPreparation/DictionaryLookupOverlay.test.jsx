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

function setup({ targetTag = "span", regionAttribute = "data-exam-annotation-region", collectionKey } = {}) {
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
  const view = render(<><article role="button"><div data-dictionary-region="subtitle">
    <span>ging </span><button>gehen</button>
  </div></article><DictionaryLookupOverlay collectionKey="video:64" /></>);
  const word = screen.getByText("ging");
  const button = screen.getByRole("button", { name: "gehen" });
  document.caretPositionFromPoint = () => ({ offsetNode: word.firstChild, offset: 2 });
  return { ...view, word, button };
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
    expect(setDictionaryFavorite).toHaveBeenCalledWith(4, false, undefined);
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

  it("looks up ordinary subtitle text on desktop outside a button-like row", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    const { word } = setupVideoSubtitle();

    fireEvent.pointerMove(word, { clientX: 1, clientY: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();
    });

    expect(lookupDictionaryWord).toHaveBeenCalledWith("ging", "video:64");
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

  it.each(["desktop", "touch"])("ignores a nested subtitle button on %s", async (inputType) => {
    if (inputType === "desktop") {
      window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") }));
    }
    const { button } = setupVideoSubtitle();
    if (inputType === "desktop") {
      fireEvent.pointerMove(button, { clientX: 1, clientY: 1 });
      await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    } else {
      fireEvent.pointerUp(button, { pointerType: "touch", clientX: 1, clientY: 1 });
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    }
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
