import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LexiconPage from "./LexiconPage.jsx";
import { fetchAllFavoriteVocabularyCards, setVocabularyCardFavorite } from "../../api/exam_preparation/vocabularyCards.js";
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
    apiMocks.setVocabularyCardFavorite.mockResolvedValue({ is_favorite: false });
  });

  it("defaults to video season and preserves the video data path", async () => {
    renderPage();
    expect(await screen.findByText(/左侧先选择/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "视频季" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "备考季" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(fetchVideoList).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/已收藏/)).not.toBeInTheDocument();
    expect(fetchAllFavoriteVocabularyCards).not.toHaveBeenCalled();
  });

  it("loads exam favorites, filters by kind, and removes a card after canceling", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "备考季" }));
    expect(await screen.findByText("Begriff")).toBeInTheDocument();
    expect(screen.getByText("已收藏 3")).toBeInTheDocument();
    expect(screen.getByText(/复数：Begriffe/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "认识" })).not.toBeInTheDocument();
    expect(fetchAllFavoriteVocabularyCards).toHaveBeenCalledTimes(1);
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

  it("limits writing cards to 22rem and collapses to one column on mobile widths", () => {
    expect(WRITING_CSS).toMatch(/\.writing-detail-vocabulary__cards\s*\{[^}]*repeat\(auto-fill,\s*minmax\(min\(100%,\s*18rem\),\s*22rem\)\)[^}]*justify-content:\s*start/s);
    expect(WRITING_CSS).toMatch(/@media\s*\(max-width:\s*1024px\)[\s\S]*?\.writing-detail-vocabulary__cards\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
