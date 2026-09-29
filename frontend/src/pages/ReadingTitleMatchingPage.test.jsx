import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchReadingTitleMatchingExerciseDetail } from "../api/exam_preparation/readingTitleMatching.js";
import { fetchReadingTitleMatchingItemStates } from "../api/exam_preparation/userExerciseStates.js";
import ReadingTitleMatchingPage from "./ReadingTitleMatchingPage.jsx";

vi.mock("../api/exam_preparation/readingTitleMatching.js", () => ({
  fetchReadingTitleMatchingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchReadingTitleMatchingItemStates: vi.fn(),
  saveReadingTitleMatchingItemState: vi.fn(),
}));

describe("reading title matching options", () => {
  beforeEach(() => {
    fetchReadingTitleMatchingExerciseDetail.mockResolvedValue({
      id: 17,
      exercise_base: { external_id: "17", level: "B1", exam_type: "telc" },
      instruction: "Ordnen Sie die Überschriften zu.",
      options: [
        { id: 1, option_key: "A", option_text: "Erster Titel" },
        { id: 2, option_key: "B", option_text: "Zweiter Titel" },
      ],
      items: [{
        id: 101,
        item_number: 1,
        text: "Lesetext",
        correct_option: { id: 1, option_key: "A", option_text: "Erster Titel" },
      }],
    });
    fetchReadingTitleMatchingItemStates.mockResolvedValue({ results: [] });
  });

  it("shows each option letter before its title", async () => {
    render(
      <MemoryRouter initialEntries={["/exercise/17"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ReadingTitleMatchingPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Überschrift zu Text 1" }));

    const firstOption = await screen.findByRole("button", { name: "A Erster Titel" });
    expect(screen.getByRole("button", { name: "B Zweiter Titel" })).toBeInTheDocument();
    fireEvent.click(firstOption);

    const selectedAnswer = screen.getByRole("button", { name: "Überschrift zu Text 1" });
    expect(within(selectedAnswer).getByText("A")).toHaveClass("reading-title-select__key");
    expect(within(selectedAnswer).getByText("Erster Titel")).toHaveClass("reading-title-select__label");
  });
});
