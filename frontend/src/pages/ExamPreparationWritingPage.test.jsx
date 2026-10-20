import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { fetchWritingExercises } from "../api/exam_preparation/writingExercises.js";
import ExamPreparationWritingPage from "./ExamPreparationWritingPage.jsx";
import {
  writingCardContent,
  writingWordLimitLabel,
} from "./writingDisplay.js";

vi.mock("../api/exam_preparation/writingExercises.js", () => ({
  fetchWritingExercises: vi.fn(),
}));

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: null }),
}));

describe("ExamPreparationWritingPage", () => {
  it("uses the imported title and no article preview for TELC B2", () => {
    expect(writingCardContent({
      exercise_base: { title: "Hotelzimmer reklamieren", exam_type: "TELC", level: "B2" },
      request_text: "Langer Artikel",
    }, 0)).toEqual({ title: "Hotelzimmer reklamieren", preview: "" });
  });

  it("does not generate a numbered fallback title for TELC B2", () => {
    expect(writingCardContent({
      exercise_base: { title: "", exam_type: "TELC", level: "B2" },
      request_text: "Langer Artikel",
    }, 2)).toEqual({ title: "", preview: "" });
  });

  it("renders a B2 card with its imported title and without numbered or article copy", async () => {
    fetchWritingExercises.mockResolvedValue({
      results: [{
        id: 122,
        exercise_base: {
          title: "Hotelzimmer reklamieren",
          exam_type: "TELC",
          level: "B2",
        },
        request_text: "Dieser Artikel darf nicht auf der Karte erscheinen.",
        time_limit_minutes: 30,
        words_limit: 150,
      }],
    });

    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b2/schreiben"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/schreiben"
            element={<ExamPreparationWritingPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Hotelzimmer reklamieren" })).toBeInTheDocument();
    expect(screen.queryByText("写作练习 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Dieser Artikel darf nicht auf der Karte erscheinen.")).not.toBeInTheDocument();
  });

  it("uses the imported title and no article preview for B1", () => {
    expect(writingCardContent({
      exercise_base: { title: "B1 title", exam_type: "TELC", level: "B1" },
      request_text: "Artikel",
    }, 1)).toEqual({ title: "B1 title", preview: "" });
  });

  it("labels the B2 writing target as a minimum", () => {
    expect(writingWordLimitLabel({
      exercise_base: { exam_type: "TELC", level: "B2" },
      words_limit: 150,
    })).toBe("最少 150 词");
  });
});
