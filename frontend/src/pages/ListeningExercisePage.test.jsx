import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchListeningExerciseDetail } from "../api/exam_preparation/listeningExercises.js";
import { fetchListeningQuestionStates } from "../api/exam_preparation/userExerciseStates.js";
import ListeningExercisePage from "./ListeningExercisePage.jsx";

vi.mock("../api/exam_preparation/listeningExercises.js", () => ({
  fetchListeningExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchListeningQuestionStates: vi.fn(),
  saveListeningQuestionState: vi.fn(),
}));

function renderExercise(listeningType) {
  return render(
    <MemoryRouter initialEntries={["/exercise/17"]}>
      <Routes>
        <Route
          path="/exercise/:exerciseId"
          element={<ListeningExercisePage listeningType={listeningType} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("listening exercise playback count", () => {
  let playSpy;

  beforeEach(() => {
    fetchListeningExerciseDetail.mockResolvedValue({
      id: 17,
      audio_file_url: "/teil2.m4a",
      exercise_base: { title: "Hören Teil 2", external_id: "17" },
      questions: [],
    });
    fetchListeningQuestionStates.mockResolvedValue({ results: [] });
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("automatically starts a second Teil 2 play without enabling an endless repeat", async () => {
    const { container } = renderExercise("short_text_true_false_once");
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/teil2.m4a");
      return element;
    });

    expect(screen.queryByText("Repeat aktivieren")).not.toBeInTheDocument();
    fireEvent.ended(audio);
    expect(playSpy).toHaveBeenCalledTimes(1);

    fireEvent.ended(audio);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Teil 1", "short_text_true_false_with_prep"],
    ["Teil 3", "dialog_true_false_twice"],
  ])("does not automatically replay %s", async (_label, listeningType) => {
    const { container } = renderExercise(listeningType);
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/teil2.m4a");
      return element;
    });

    fireEvent.ended(audio);
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Repeat aktivieren")).toBeInTheDocument();
  });
});
