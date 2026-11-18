import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchExerciseQuestionsByVideo: vi.fn() }));
vi.mock("../../../api/learning_by_video/exercise_questions.js", () => ({
  fetchExerciseQuestionsByVideo: mocks.fetchExerciseQuestionsByVideo,
}));

import ExercisePanel from "./ExercisePanel.jsx";

describe("ExercisePanel dictionary regions", () => {
  beforeEach(() => {
    mocks.fetchExerciseQuestionsByVideo.mockResolvedValue([{
      id: 1,
      prompt: "Ich ____ nach Hause.",
      explanation: "Weil ich nach Hause gehe.",
      options: [
        { id: 1, text: "gehe richtig", is_correct: true },
        { id: 2, text: "gehen falsch", is_correct: false },
      ],
    }]);
  });

  it("keeps the correct answer and explanation unavailable until confirmation", async () => {
    render(<ExercisePanel isOpen onClose={() => {}} videoId={7} seasonNumber={4} />);
    await screen.findByText("Ich");

    expect(document.querySelector("[data-dictionary-region]")).toBeNull();
    fireEvent.click(document.querySelector(".exPanelGrammarBlank"));
    fireEvent.click(screen.getByText("gehen falsch"));
    expect(document.querySelector("[data-dictionary-region]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => expect(document.querySelectorAll("[data-dictionary-region]")).toHaveLength(2));
    expect(document.querySelectorAll('[data-dictionary-region]')[0]).toHaveTextContent("gehe richtig");
    expect(document.querySelectorAll('[data-dictionary-region]')[1]).toHaveTextContent("Weil ich nach Hause gehe.");
  });
});
