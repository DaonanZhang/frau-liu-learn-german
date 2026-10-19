import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function successfulAudioResponse(url) {
  const blob = new Blob(["audio"]);
  Object.defineProperty(blob, "sourceUrl", { value: url });
  return { ok: true, status: 200, blob: async () => blob };
}

beforeAll(() => {
  URL.createObjectURL = (blob) => `blob:${blob.sourceUrl}`;
  URL.revokeObjectURL = vi.fn();
});

afterAll(() => {
  if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
  else delete URL.createObjectURL;
  if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
  else delete URL.revokeObjectURL;
});

function renderExercise(listeningType, level = "b1") {
  return render(
    <MemoryRouter initialEntries={[`/exercise/${level}/17`]}>
      <Routes>
        <Route
          path="/exercise/:level/:exerciseId"
          element={<ListeningExercisePage listeningType={listeningType} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function createListeningExercise(overrides = {}) {
  return {
    id: 17,
    audio_file_url: "/teil2.m4a",
    exercise_base: {
      title: "Hören Teil 2",
      external_id: "17",
      exercise_type: "LISTENING_TEIL2",
    },
    questions: [
      {
        id: 41,
        question_number: 1,
        question_text: "Welche Aussage stimmt?",
        explanation: "Die erste Aussage passt zum Gespräch.",
        explanation_scope: "question",
        answer_options: [
          { id: 411, option_key: "A", option_text: "Die erste Aussage.", is_correct: true },
          { id: 412, option_key: "B", option_text: "Die zweite Aussage.", is_correct: false },
        ],
      },
    ],
    script: "Das ist der Hörtext.",
    ...overrides,
  };
}

describe("listening exercise audio loading", () => {
  beforeEach(() => {
    fetchListeningExerciseDetail.mockResolvedValue(createListeningExercise({ questions: [] }));
    fetchListeningQuestionStates.mockResolvedValue({ results: [] });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the original stream playable while the backup Blob downloads", async () => {
    const { container } = renderExercise("short_text_true_false_once");

    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "/teil2.m4a"));
    expect(screen.getByRole("button", { name: "Audio abspielen" })).toBeEnabled();
    expect(screen.queryByText("音频加载中…")).not.toBeInTheDocument();
  });

  it("retries an initial stream load error without autoplaying a practice recording", async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = renderExercise("short_text_true_false_once");
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/teil2.m4a");
      return element;
    });

    fireEvent.error(audio);
    await act(async () => { await Promise.resolve(); });

    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("retries the Blob download after 1, 2, and 4 seconds and reports failure only if the stream also fails", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", request);
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("stream failed"));

    renderExercise("short_text_true_false_once");
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("听力音频加载失败，请刷新页面后重试。")).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("听力音频加载失败，请刷新页面后重试。")).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(request).toHaveBeenCalledTimes(3);
    expect(screen.queryByText("听力音频加载失败，请刷新页面后重试。")).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(request).toHaveBeenCalledTimes(4);
    expect(screen.queryByText("听力音频加载失败，请刷新页面后重试。")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Audio abspielen" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText("听力音频加载失败，请刷新页面后重试。")).toBeInTheDocument();
  });

  it("reloads a failed stream once before waiting for the backup Blob", async () => {
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load");
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("stream failed"))
      .mockRejectedValueOnce(new Error("stream failed again"));
    renderExercise("short_text_true_false_once");
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(await screen.findByRole("button", { name: "Audio abspielen" }));

    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2));
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("正在切换备用音频…")).toBeInTheDocument();
  });

  it("continues from the same position when the backup Blob becomes ready", async () => {
    let finishDownload;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finishDownload = resolve; })));
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce(new Error("stream failed"))
      .mockRejectedValueOnce(new Error("stream failed again"))
      .mockResolvedValue(undefined);
    const { container } = renderExercise("short_text_true_false_once");
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/teil2.m4a");
      return element;
    });
    audio.currentTime = 23;
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole("button", { name: "Audio abspielen" }));
    await waitFor(() => expect(screen.getByText("正在切换备用音频…")).toBeInTheDocument());
    await act(async () => { finishDownload(successfulAudioResponse("/teil2.m4a")); await Promise.resolve(); });
    const backupAudio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "blob:/teil2.m4a");
      return element;
    });
    fireEvent.canPlay(backupAudio);
    await act(async () => { await Promise.resolve(); });

    expect(backupAudio.currentTime).toBe(23);
    expect(playSpy).toHaveBeenCalledTimes(3);
  });
});

describe("listening exercise playback count", () => {
  let playSpy;

  beforeEach(() => {
    fetchListeningExerciseDetail.mockResolvedValue(createListeningExercise({ questions: [] }));
    fetchListeningQuestionStates.mockResolvedValue({ results: [] });
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url) => successfulAudioResponse(url)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.Highlight;
    delete window.CSS;
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

  it("uses the active B2 route level when exercise metadata omits its level", async () => {
    renderExercise("short_text_true_false_once", "b2");
    expect(await screen.findByText(/B2 · 17/)).toBeInTheDocument();
  });

  it("shows the TELC B2 Teil 1 Anleitung as one continuous paragraph", async () => {
    renderExercise("short_text_true_false_with_prep", "b2");

    expect(await screen.findByText(
      "Sie hören nun eine Nachrichtensendung. Dazu sollen Sie fünf Aufgaben lösen. Sie hören die Nachrichtensendung nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1–5 richtig oder falsch sind. Markieren Sie Ihre Lösungen auf dem Antwortbogen bei den Aufgaben 1–5. Markieren Sie PLUS (+) gleich richtig und MINUS (–) gleich falsch auf dem Antwortbogen. Lesen Sie jetzt die Aufgaben 1–5. Sie haben dazu 30 Sekunden Zeit.",
    )).toBeInTheDocument();
  });
});

describe("listening exercise text annotations", () => {
  beforeEach(() => {
    window.Highlight = function FakeHighlight(...ranges) {
      this.ranges = ranges;
    };
    window.CSS = { highlights: new Map() };
    sessionStorage.clear();
    fetchListeningExerciseDetail.mockResolvedValue(createListeningExercise());
    fetchListeningQuestionStates.mockResolvedValue({ results: [] });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url) => successfulAudioResponse(url)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete window.Highlight;
    delete window.CSS;
  });

  it("registers learning regions in the exercise scope and excludes controls", async () => {
    renderExercise("short_text_true_false_once");

    expect(await screen.findByText(/Sie hören nun ein Gespräch\./)).toHaveAttribute(
      "data-exam-annotation-region",
      "task",
    );
    expect(screen.getByRole("heading", { name: "Welche Aussage stimmt?" })).toHaveAttribute(
      "data-exam-annotation-region",
      "question:41",
    );
    expect(screen.getByText("Die erste Aussage.")).toHaveAttribute(
      "data-exam-annotation-region",
      "option:41:411",
    );
    expect(screen.getByRole("button", { name: "Audio abspielen" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByRole("button", { name: "Prüfen" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:LISTENING_TEIL2:17")).toBeNull();
  });

  it("keeps ordinary option clicks and audio controls usable", async () => {
    const { container } = renderExercise("short_text_true_false_once");
    const option = await screen.findByRole("radio", { name: /Die erste Aussage/ });
    fireEvent.click(option);
    expect(option).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Audio abspielen" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(container.querySelector("audio")).toBeInTheDocument();
  });

  it("keeps the correct option visibly marked after checking a wrong answer", async () => {
    renderExercise("short_text_true_false_once");
    const wrongOption = await screen.findByRole("radio", { name: /Die zweite Aussage/ });
    fireEvent.click(wrongOption);
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });

    expect(wrongOption.closest("label")).toHaveClass("listening-exercise-option--wrong");
    expect(screen.getByText("Die erste Aussage.").closest("label")).toHaveClass(
      "listening-exercise-option--correct",
    );
  });

  it("preserves marks after Prüfen and clears the exercise scope on Wiederholen", async () => {
    renderExercise("short_text_true_false_once");
    const task = await screen.findByText(/Sie hören nun ein Gespräch\./);
    const range = document.createRange();
    range.setStart(task.firstChild, 0);
    range.setEnd(task.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));

    const option = screen.getByRole("radio", { name: /Die erste Aussage/ });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });

    const scopeKey = "exam-annotations:v1:exercise:LISTENING_TEIL2:17";
    expect(JSON.parse(sessionStorage.getItem(scopeKey)).regions.task).toHaveLength(1);
    expect(screen.getByText("Das ist der Hörtext.")).toHaveAttribute(
      "data-exam-annotation-region",
      "transcript:script",
    );
    const explanation = document.querySelector('[data-exam-annotation-region="explanation:41"]');
    expect(explanation).toHaveTextContent("Die erste Aussage passt zum Gespräch.");

    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    expect(sessionStorage.getItem(scopeKey)).toBeNull();
    expect(screen.getAllByRole("radio").every((radio) => !radio.checked)).toBe(true);
    expect(screen.queryByText("Das ist der Hörtext.")).not.toBeInTheDocument();
  });
});
