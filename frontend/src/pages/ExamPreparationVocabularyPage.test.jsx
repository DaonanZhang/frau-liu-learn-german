import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExamPreparationVocabularyPage from "./ExamPreparationVocabularyPage.jsx";
import { fetchVocabularyCards, setVocabularyCardFavorite } from "../api/exam_preparation/vocabularyCards.js";

vi.mock("../api/exam_preparation/vocabularyCards.js", () => ({ fetchVocabularyCards: vi.fn(), setVocabularyCardFavorite: vi.fn() }));

function renderPage() {
  return render(<MemoryRouter initialEntries={["/modules/exam-preparation/c1/wortschatz"]}><Routes>
    <Route path="/modules/exam-preparation/c1/wortschatz" element={<ExamPreparationVocabularyPage />} />
  </Routes></MemoryRouter>);
}

describe("ExamPreparationVocabularyPage", () => {
  beforeEach(() => {
    fetchVocabularyCards.mockReset();
    setVocabularyCardFavorite.mockReset();
    fetchVocabularyCards.mockResolvedValue({ count: 2, next: "/page/2", results: [{ id: 1, term: "Wort", translation_zh: "词", is_favorite: true }] });
  });

  it("shows all cards without a favorites tab and keeps a card after unfavoriting", async () => {
    renderPage();
    expect(await screen.findByText("Wort")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已收藏" })).not.toBeInTheDocument();
    setVocabularyCardFavorite.mockResolvedValue({ is_favorite: false });
    fireEvent.click(await screen.findByRole("button", { name: "取消收藏 Wort" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "收藏 Wort" })).toBeInTheDocument());
    expect(screen.getByText("Wort")).toBeInTheDocument();
    expect(fetchVocabularyCards).toHaveBeenCalledWith({ page: 1 });
  });

  it("loads the next page", async () => {
    fetchVocabularyCards.mockResolvedValueOnce({ next: "/page/2", results: [{ id: 1, term: "Wort" }] }).mockResolvedValueOnce({ next: null, results: [{ id: 2, term: "Sprache" }] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("Sprache")).toBeInTheDocument();
    expect(fetchVocabularyCards).toHaveBeenLastCalledWith({ page: 2 });
  });

  it("uses the single empty state when there are no cards", async () => {
    fetchVocabularyCards.mockResolvedValue({ count: 0, next: null, results: [] });
    renderPage();
    expect(await screen.findByText("暂无词汇")).toBeInTheDocument();
    expect(screen.queryByText(/收藏的词汇/)).not.toBeInTheDocument();
  });
});
