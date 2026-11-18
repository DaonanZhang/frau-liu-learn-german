import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LexiconPage from "./LexiconPage.jsx";
import { fetchAllFavoriteVocabularyCards, setVocabularyCardFavorite, setVocabularyCardKnowledge } from "../../api/exam_preparation/vocabularyCards.js";
import { fetchVideoList } from "../../api/learning_by_video/videos.js";

const apiMocks = vi.hoisted(() => ({
  fetchVideoList: vi.fn(),
  fetchExpressionOccurrences: vi.fn(),
  fetchWordOccurrences: vi.fn(),
  fetchSubtitlesByVideo: vi.fn(),
  fetchUserSubtitleFavoritesByVideo: vi.fn(),
  setSubtitleFavorite: vi.fn(),
  toggleVideoOccurrenceMark: vi.fn(),
  fetchAllFavoriteVocabularyCards: vi.fn(),
  setVocabularyCardFavorite: vi.fn(),
  setVocabularyCardKnowledge: vi.fn(),
}));

vi.mock("../../api/learning_by_video/videos.js", () => ({ fetchVideoList: apiMocks.fetchVideoList }));
vi.mock("../../api/learning_by_video/occurrences.js", () => ({
  fetchWordOccurrences: apiMocks.fetchWordOccurrences,
  fetchExpressionOccurrences: apiMocks.fetchExpressionOccurrences,
}));
vi.mock("../../api/learning_by_video/subtitles.js", () => ({ fetchSubtitlesByVideo: apiMocks.fetchSubtitlesByVideo }));
vi.mock("../../api/learning_by_video/subtitle_favorites.js", () => ({
  fetchUserSubtitleFavoritesByVideo: apiMocks.fetchUserSubtitleFavoritesByVideo,
  setSubtitleFavorite: apiMocks.setSubtitleFavorite,
}));
vi.mock("../../api/learning_by_video/marks_occurrences.js", () => ({ toggleVideoOccurrenceMark: apiMocks.toggleVideoOccurrenceMark }));
vi.mock("../../api/exam_preparation/vocabularyCards.js", () => ({
  fetchAllFavoriteVocabularyCards: apiMocks.fetchAllFavoriteVocabularyCards,
  setVocabularyCardFavorite: apiMocks.setVocabularyCardFavorite,
  setVocabularyCardKnowledge: apiMocks.setVocabularyCardKnowledge,
}));

const WRITING_CSS = readFileSync(resolve("src/pages/ExamPreparationWritingDetailPage.css"), "utf8");

function renderPage() {
  return render(<MemoryRouter><LexiconPage /></MemoryRouter>);
}

describe("LexiconPage sources", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.fetchVideoList.mockResolvedValue([]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([]);
    apiMocks.fetchExpressionOccurrences.mockResolvedValue([]);
    apiMocks.fetchSubtitlesByVideo.mockResolvedValue([]);
    apiMocks.fetchUserSubtitleFavoritesByVideo.mockResolvedValue([]);
    apiMocks.fetchAllFavoriteVocabularyCards.mockResolvedValue([
      { id: 1, kind: "word", term: "Begriff", translation_zh: "概念", part_of_speech: "NOUN", article: "der", note: "用法", plural: "Begriffe", is_favorite: true },
      { id: 2, kind: "expression", term: "eine Rolle spielen", translation_zh: "发挥作用", is_favorite: true },
      { id: 3, kind: "sentence", term: "Das Beispiel zählt.", translation_zh: "这个例子很重要。", note: "例句备注", is_favorite: true },
    ]);
    apiMocks.fetchAllFavoriteVocabularyCards.mockImplementation((scope) => scope?.collectionPrefix === "exam:" ? Promise.resolve([
      { id: 1, kind: "word", term: "Begriff", translation_zh: "概念", part_of_speech: "NOUN", article: "der", note: "用法", plural: "Begriffe", is_favorite: true },
      { id: 2, kind: "expression", term: "eine Rolle spielen", translation_zh: "发挥作用", is_favorite: true },
      { id: 3, kind: "sentence", term: "Das Beispiel zählt.", translation_zh: "这个例子很重要。", note: "例句备注", is_favorite: true },
    ]) : Promise.resolve([]));
    apiMocks.setVocabularyCardFavorite.mockResolvedValue({ is_favorite: false });
    apiMocks.setVocabularyCardKnowledge.mockImplementation((_id, knowledge) => Promise.resolve({ knowledge }));
  });

  it("defaults to video season and preserves the video data path", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "全部视频词汇" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "视频季" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "备考季" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(fetchVideoList).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/已收藏/)).not.toBeInTheDocument();
    expect(fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionPrefix: "video:" });
  });

  it("loads exam favorites, filters by kind, and removes a card after canceling", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    expect(await screen.findByText("Begriff")).toBeInTheDocument();
    expect(screen.getByText("已收藏 3")).toBeInTheDocument();
    expect(screen.getByText(/复数：Begriffe/)).toBeInTheDocument();
    expect(within(screen.getByText("Begriff").closest(".lp-card")).getByRole("button", { name: "认识" })).toBeInTheDocument();
    expect(fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionPrefix: "exam:" });
    const wordCard = screen.getByText("Begriff").closest(".lp-card");
    fireEvent.click(within(wordCard).getByRole("button", { name: "Hide Chinese" }));
    expect(screen.queryByText("概念")).not.toBeInTheDocument();
    fireEvent.click(within(wordCard).getByRole("button", { name: "Show Chinese" }));
    expect(screen.getByText("概念")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /地道表达/ }));
    expect(await screen.findByText("eine Rolle spielen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /句子/ }));
    expect(await screen.findByText("Das Beispiel zählt.")).toBeInTheDocument();
    expect(screen.getByText("这个例子很重要。")).toBeInTheDocument();
    expect(screen.getByText("例句备注")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消收藏 Das Beispiel zählt." }));
    await waitFor(() => expect(screen.queryByText("Das Beispiel zählt.")).not.toBeInTheDocument());
    expect(setVocabularyCardFavorite).toHaveBeenCalledWith(3, false);
    expect(apiMocks.setSubtitleFavorite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /单词/ }));
    const favorite = await screen.findByRole("button", { name: "取消收藏 Begriff" });
    fireEvent.click(favorite);
    await waitFor(() => expect(screen.queryByText("Begriff")).not.toBeInTheDocument());
    expect(setVocabularyCardFavorite).toHaveBeenCalledWith(1, false);
    expect(screen.getByText("已收藏 1")).toBeInTheDocument();
  });

  it("switches exam favorite collections and loads the exact selection", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    expect(await screen.findByText("Begriff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TELC" }));
    fireEvent.click(screen.getByRole("button", { name: "B1" }));
    await waitFor(() => expect(apiMocks.fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionKey: "exam:TELC:B1" }));
    expect(screen.queryByText("Begriff")).not.toBeInTheDocument();
  });

  it("starts each source at its aggregate collection and exposes the source directory", async () => {
    apiMocks.fetchVideoList.mockResolvedValue([
      { id: 42, title: "Science video", season_number: 1 },
      { id: 84, title: "Vlog video", season_number: 4 },
    ]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([{ id: 7, word_lemma: "lernen", translation: "学习", video: 42, word: 9 }]);
    apiMocks.fetchAllFavoriteVocabularyCards.mockImplementation((scope) => scope?.collectionPrefix === "video:"
      ? Promise.resolve([{ id: 52, collection_key: "video:84", kind: "word", term: "Vlog-Wort", translation_zh: "视频词", is_favorite: true }])
      : Promise.resolve([{ id: 1, collection_key: "exam:TELC:B2", kind: "word", term: "TELC-Wort", translation_zh: "考试词", is_favorite: true }]));
    renderPage();
    expect(await screen.findByText("lernen")).toBeInTheDocument();
    expect(await screen.findByText("Vlog-Wort")).toBeInTheDocument();
    expect(apiMocks.fetchWordOccurrences).toHaveBeenCalledWith({});
    expect(screen.getByRole("button", { name: "全部视频词汇" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    expect(await screen.findByText("TELC-Wort")).toBeInTheDocument();
    expect(apiMocks.fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionPrefix: "exam:" });
    expect(screen.getByRole("button", { name: "TELC" })).toBeInTheDocument();
    expect(screen.queryByLabelText("备考收藏范围")).not.toBeInTheDocument();
  });

  it("toggles a favorite card knowledge state and preserves it when the request fails", async () => {
    apiMocks.fetchAllFavoriteVocabularyCards.mockResolvedValue([{ id: 5, knowledge: "UNMARKED", kind: "word", term: "Wort", translation_zh: "词", is_favorite: true }]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    const card = await screen.findByText("Wort").then((node) => node.closest(".lp-card"));
    fireEvent.click(within(card).getByRole("button", { name: "认识" }));
    await waitFor(() => expect(apiMocks.setVocabularyCardKnowledge).toHaveBeenCalledWith(5, "KNOWN"));
    expect(within(card).getByRole("button", { name: "认识" })).toHaveClass("is-active");
    apiMocks.setVocabularyCardKnowledge.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(within(card).getByRole("button", { name: "不认识" }));
    expect(await within(card).findByRole("alert")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "认识" })).toHaveClass("is-active");
  });

  it("keeps matching video favorites independent from occurrences and can unfavorite them", async () => {
    apiMocks.fetchVideoList.mockResolvedValue([{ id: 42, title: "Video 42", season_number: 1 }]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([{ id: 7, word_lemma: "lernen", translation: "学习", video: 42, word: 9, word_pos: "VERB" }]);
    apiMocks.fetchAllFavoriteVocabularyCards.mockImplementation((scope) => scope?.collectionKey === "video:42" ? Promise.resolve([
      { id: 51, collection_key: "video:42", kind: "word", term: " Lernen ", translation_zh: " 学习 ", is_favorite: true },
      { id: 52, collection_key: "video:42", kind: "word", term: "Neu", translation_zh: "新词", is_favorite: true },
    ]) : Promise.resolve([]));
    renderPage();
    fireEvent.click(await screen.findByText("科普季"));
    await screen.findAllByText("Video 42");
    fireEvent.click(screen.getAllByText("Video 42")[0]);
    expect(await screen.findByText("lernen")).toBeInTheDocument();
    expect(await screen.findByText("Neu")).toBeInTheDocument();
    expect(apiMocks.fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionKey: "video:42" });
    expect(screen.getAllByRole("button", { name: /取消收藏/ })).toHaveLength(2);
    const merged = screen.getByText("Lernen").closest(".lp-card");
    expect(within(merged).getByRole("button", { name: "取消收藏 Lernen" })).toBeInTheDocument();
    expect(within(merged).getByRole("button", { name: "认识" })).toBeInTheDocument();
    expect(within(merged).getByRole("button", { name: "不认识" })).toBeInTheDocument();
    fireEvent.click(within(merged).getByRole("button", { name: "取消收藏 Lernen" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "取消收藏 Lernen" })).not.toBeInTheDocument());
    expect(setVocabularyCardFavorite).toHaveBeenCalledWith(51, false);
    expect(screen.getAllByRole("button", { name: "认识" })).toHaveLength(2);
  });

  it("does not merge a word favorite into an expression with the same term and translation", async () => {
    apiMocks.fetchVideoList.mockResolvedValue([{ id: 42, title: "Video 42", season_number: 1 }]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([{ id: 7, word_lemma: "lernen", translation: "学习", video: 42, word: 9 }]);
    apiMocks.fetchExpressionOccurrences.mockResolvedValue([{ id: 8, expression_prototype: "lernen", translation: "学习", video: 42, expression: 10 }]);
    apiMocks.fetchAllFavoriteVocabularyCards.mockImplementation((scope) => scope?.collectionKey === "video:42" ? Promise.resolve([
      { id: 51, collection_key: "video:42", kind: "word", term: "lernen", translation_zh: "学习", is_favorite: true },
    ]) : Promise.resolve([]));
    renderPage();
    fireEvent.click(await screen.findByText("科普季"));
    await screen.findAllByText("Video 42");
    fireEvent.click(screen.getAllByText("Video 42")[0]);
    await screen.findAllByText("lernen");
    fireEvent.click(screen.getByRole("button", { name: /地道表达/ }));
    const expressionCard = await screen.findByText("lernen");
    expect(within(expressionCard.closest(".lp-card")).queryByRole("button", { name: /取消收藏/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /单词/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /单词/ }));
    const wordCard = screen.getAllByText("lernen").map((node) => node.closest(".lp-card")).find((node) => within(node).queryByRole("button", { name: /取消收藏/ }));
    expect(within(wordCard).getByRole("button", { name: /取消收藏/ })).toBeInTheDocument();
  });

  it("does not show favorite controls for ordinary video occurrences", async () => {
    apiMocks.fetchVideoList.mockResolvedValue([{ id: 42, title: "Video 42", season_number: 1 }]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([{ id: 7, word_lemma: "lernen", translation: "学习", video: 42, word: 9 }]);
    renderPage();
    fireEvent.click(await screen.findByText("科普季"));
    await screen.findAllByText("Video 42");
    fireEvent.click(screen.getAllByText("Video 42")[0]);
    expect(await screen.findByText("lernen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /收藏 lernen/ })).not.toBeInTheDocument();
  });

  it("keeps mobile carousel controls clickable without starting a drag", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query) => ({ matches: query.includes("max-width: 990px"), addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    apiMocks.fetchAllFavoriteVocabularyCards.mockResolvedValue([
      { id: 11, kind: "word", term: "Erster Begriff", translation_zh: "第一项", is_favorite: true },
      { id: 12, kind: "word", term: "Zweiter Begriff", translation_zh: "第二项", is_favorite: true },
    ]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    expect(screen.getByRole("button", { name: "目录" })).toBeInTheDocument();
    await screen.findByText("Erster Begriff");
    fireEvent.click(screen.getByRole("button", { name: /单词/ }));
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Erster Begriff")).toBeInTheDocument();

    const carousel = document.querySelector(".lp-carousel");
    carousel.setPointerCapture = vi.fn();
    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.pointerDown(next, { pointerId: 1, clientX: 320 });
    expect(carousel.setPointerCapture).not.toHaveBeenCalled();
    fireEvent.click(next);
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("Zweiter Begriff")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("Erster Begriff")).toBeInTheDocument();
  });

  it("keeps the card and reports an error when cancellation fails", async () => {
    apiMocks.setVocabularyCardFavorite.mockRejectedValue(new Error("network"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    expect(await screen.findByText("Begriff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消收藏 Begriff" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("取消收藏失败，请重试。");
    expect(screen.getByText("Begriff")).toBeInTheDocument();
    expect(screen.getByText("已收藏 3")).toBeInTheDocument();
  });

  it("filters aggregate video cards by accessible parent videos and leaves sentences scoped", async () => {
    apiMocks.fetchVideoList.mockResolvedValue([
      { id: 42, title: "Science", season_number: 1 },
      { id: 84, title: "Vlog", season_number: 4 },
      { id: 99, title: "Locked", season_number: 1, is_locked: true },
    ]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([
      { id: 7, video: 42, word: 1, word_lemma: "Wissenschaft" },
      { id: 8, video: 84, word: 2, word_lemma: "Alltag" },
      { id: 9, video: 99, word: 3, word_lemma: "Geheim" },
    ]);
    apiMocks.fetchAllFavoriteVocabularyCards.mockResolvedValue([
      { id: 50, collection_key: "video:84", term: "Vlogfavorit", kind: "word", is_favorite: true },
      { id: 51, collection_key: "video:99", term: "Lockedfavorit", kind: "word", is_favorite: true },
    ]);
    renderPage();
    expect(await screen.findByText("Alltag")).toBeInTheDocument();
    expect(screen.getByText("Vlogfavorit")).toBeInTheDocument();
    expect(screen.queryByText("Geheim")).not.toBeInTheDocument();
    expect(screen.queryByText("Lockedfavorit")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("科普季"));
    await waitFor(() => expect(screen.queryByText("Alltag")).not.toBeInTheDocument());
    expect(screen.getByText("Wissenschaft")).toBeInTheDocument();
    expect(screen.queryByText("Vlogfavorit")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /句子/ }));
    expect(screen.getByText("请选择具体视频查看句子")).toBeInTheDocument();
    expect(apiMocks.fetchSubtitlesByVideo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("button", { name: "全部视频词汇" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByRole("button", { name: "全部视频词汇" })).toBeInTheDocument();
  });

  it("loads persisted knowledge, resets repeated clicks, and opens the mobile exam directory", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    apiMocks.fetchAllFavoriteVocabularyCards.mockResolvedValue([{ id: 5, term: "Gespeichert", kind: "word", is_favorite: true, knowledge: "KNOWN" }]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    await screen.findByText("Gespeichert");
    const known = screen.getByRole("button", { name: "认识" });
    expect(known).toHaveClass("is-active");
    fireEvent.click(known);
    await waitFor(() => expect(known).not.toHaveClass("is-active"));
    expect(apiMocks.setVocabularyCardKnowledge).toHaveBeenCalledWith(5, "UNMARKED");
    fireEvent.click(screen.getByRole("button", { name: "目录" }));
    fireEvent.click(screen.getByRole("button", { name: "TELC" }));
    await waitFor(() => expect(apiMocks.fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionPrefix: "exam:TELC:" }));
    fireEvent.click(screen.getByRole("button", { name: "B2" }));
    await waitFor(() => expect(apiMocks.fetchAllFavoriteVocabularyCards).toHaveBeenCalledWith({ collectionKey: "exam:TELC:B2" }));
    expect(screen.getByRole("button", { name: "目录" })).toBeInTheDocument();
  });

  it("loads all video vocabulary on mobile while the directory stays closed", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
    apiMocks.fetchVideoList.mockResolvedValue([{ id: 42, title: "Science", season_number: 1 }]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([{ id: 7, video: 42, word: 9, word_lemma: "Mobilwort" }]);
    renderPage();
    expect(await screen.findByText("Mobilwort")).toBeInTheDocument();
    expect(apiMocks.fetchVideoList).toHaveBeenCalled();
    expect(apiMocks.fetchWordOccurrences).toHaveBeenCalledWith({});
    expect(screen.getByRole("button", { name: "目录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部视频词汇" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "目录" }));
    expect(screen.getByRole("button", { name: "全部视频词汇" })).toBeInTheDocument();
    await waitFor(() => expect(apiMocks.fetchVideoList).toHaveBeenCalledTimes(1));
  });

  it("keeps knowledge independent for occurrences sharing an ID", async () => {
    apiMocks.fetchVideoList.mockResolvedValue([{ id: 42, title: "Science", season_number: 1 }]);
    apiMocks.fetchWordOccurrences.mockResolvedValue([{ id: 7, video: 42, word: 9, word_lemma: "Bekannt", my_knowledge: "KNOWN" }]);
    apiMocks.fetchExpressionOccurrences.mockResolvedValue([{ id: 7, video: 42, expression: 10, expression_prototype: "Noch unbekannt", my_knowledge: "UNKNOWN" }]);
    renderPage();
    const word = (await screen.findByText("Bekannt")).closest(".lp-card");
    expect(within(word).getByRole("button", { name: "认识" })).toHaveClass("is-active");
    fireEvent.click(screen.getByRole("button", { name: "认识 (1)" }));
    expect(screen.getByText("Bekannt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /地道表达/ }));
    fireEvent.click(screen.getByRole("button", { name: /^全部 / }));
    const expression = (await screen.findByText("Noch unbekannt")).closest(".lp-card");
    expect(within(expression).getByRole("button", { name: "不认识" })).toHaveClass("is-active");
    expect(screen.getByRole("button", { name: "不认识 (1)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "认识 (0)" }));
    expect(screen.queryByText("Noch unbekannt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "不认识 (1)" }));
    expect(screen.getByText("Noch unbekannt")).toBeInTheDocument();
  });

  it("clears failed mobile card error when moving to the next entry", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    apiMocks.fetchAllFavoriteVocabularyCards.mockResolvedValue([
      { id: 11, kind: "word", term: "First", is_favorite: true },
      { id: 12, kind: "word", term: "Second", is_favorite: true },
    ]);
    apiMocks.setVocabularyCardKnowledge.mockRejectedValueOnce(new Error("offline"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    await screen.findByText("First");
    fireEvent.click(screen.getByRole("button", { name: "认识" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("更新认识状态失败");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "认识" })).toBeEnabled();
  });

  it("limits writing cards to 22rem and collapses to one column on mobile widths", () => {
    expect(WRITING_CSS).toMatch(/\.writing-detail-vocabulary__cards\s*\{[^}]*repeat\(auto-fill,\s*minmax\(min\(100%,\s*18rem\),\s*22rem\)\)[^}]*justify-content:\s*start/s);
    expect(WRITING_CSS).toMatch(/@media\s*\(max-width:\s*1024px\)[\s\S]*?\.writing-detail-vocabulary__cards\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
