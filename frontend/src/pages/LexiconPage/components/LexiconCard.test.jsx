import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LexiconCard from "./LexiconCard.jsx";

describe("LexiconCard knowledge actions", () => {
  it("shows knowledge actions for an independently favorited card", () => {
    render(<LexiconCard
      entry={{ key: "exam:1", title: "Wort", occurrenceIds: [] }}
      knowledgeState="known"
      isChineseHidden={false}
      onToggleKnown={vi.fn()}
      onToggleNotKnown={vi.fn()}
      onToggleChinese={vi.fn()}
      isFavorited
      onToggleFavorite={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "认识" })).toHaveClass("is-active");
    expect(screen.getByRole("button", { name: "不认识" })).toBeInTheDocument();
  });
});
