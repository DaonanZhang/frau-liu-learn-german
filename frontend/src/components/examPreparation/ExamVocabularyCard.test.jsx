import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ExamVocabularyCard from "./ExamVocabularyCard.jsx";
import { setVocabularyCardFavorite } from "../../api/exam_preparation/vocabularyCards.js";

vi.mock("../../api/exam_preparation/vocabularyCards.js", () => ({ setVocabularyCardFavorite: vi.fn() }));

describe("ExamVocabularyCard", () => {
  it("shows vocabulary details and updates favorite state", async () => {
    setVocabularyCardFavorite.mockResolvedValue({ is_favorite: true });
    render(<ExamVocabularyCard entry={{ card: { id: 2, term: "lernen", translation_zh: "学习", part_of_speech: "Verb", article: "das", plural: "Lernen", verb_forms: { Präsens: "lernt", Präteritum: "lernte" }, note: "常用", example_de: "Ich lerne.", example_zh: "我在学习。" } }} />);
    expect(screen.getByText("lernen")).toBeInTheDocument();
    expect(screen.getByText("Verb")).toBeInTheDocument();
    expect(screen.getByText("Präsens: lernt · Präteritum: lernte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏 lernen" })).not.toHaveTextContent(/收藏|已收藏/);
    fireEvent.click(screen.getByRole("button", { name: "收藏 lernen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "取消收藏 lernen" })).toBeInTheDocument());
  });
  it("renders legacy entries without a favorite button", () => {
    render(<ExamVocabularyCard entry={{ term: "alt", translation: "旧" }} />);
    expect(screen.getByText("旧")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("syncs favorite state when refreshed props for the same card change", () => {
    const { rerender } = render(<ExamVocabularyCard entry={{ card: { id: 8, term: "Wort", is_favorite: false } }} />);
    expect(screen.getByRole("button", { name: "收藏 Wort" })).toBeInTheDocument();
    rerender(<ExamVocabularyCard entry={{ card: { id: 8, term: "Wort", is_favorite: true } }} />);
    expect(screen.getByRole("button", { name: "取消收藏 Wort" })).toBeInTheDocument();
  });
});
