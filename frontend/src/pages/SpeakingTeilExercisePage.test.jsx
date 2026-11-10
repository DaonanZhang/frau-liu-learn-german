import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchSpeakingTeilExerciseDetail } from "../api/exam_preparation/speakingExercises.js";
import {
  fetchSpeakingTurnStates,
  saveSpeakingTurnState,
} from "../api/exam_preparation/userExerciseStates.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import SpeakingTeilExercisePage from "./SpeakingTeilExercisePage.jsx";

vi.mock("../api/exam_preparation/speakingExercises.js", () => ({
  fetchSpeakingTeilExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchSpeakingTurnStates: vi.fn(),
  saveSpeakingTurnState: vi.fn(),
}));

vi.mock("../components/examPreparation/SpeakingPracticeRecorder.jsx", () => ({
  default: ({ recordingId, audioUrl, trailingControl }) => <div className="shadowing-practice-buttons"><button type="button" aria-label={`record ${recordingId}`} data-audio-url={audioUrl}>record</button><button type="button" aria-label="朗读">play sample</button>{trailingControl}</div>,
}));

vi.mock("../components/examPreparation/ExerciseFavoriteButton.jsx", () => ({
  default: ({ onClick, isFavorited }) => <button type="button" aria-label="收藏句子" aria-pressed={isFavorited} onClick={onClick}>favorite</button>,
}));

function FakeHighlight(...ranges) {
  this.ranges = ranges;
}

function selectText(element, start, end) {
  const range = document.createRange();
  range.setStart(element.firstChild, start);
  range.setEnd(element.firstChild, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

const teil3Exercise = {
  id: 44,
  exercise_base: {
    level: "B1",
    title: "Gemeinsam planen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL3",
  },
  instruction: "Ordnen Sie den Dialog.",
  content: {
    task: "Planen Sie gemeinsam einen Ausflug.",
    sections: [{
      id: "trip",
      type: "Ausflug",
      turns: [
        { id: "first", sequence: 1, role: "TN1", text: "Wann treffen wir uns?" },
        { id: "second", sequence: 2, role: "TN2", text: "Am Samstag um zehn Uhr." },
      ],
    }],
  },
};

const teil2Exercise = {
  id: 45,
  exercise_base: {
    level: "B1",
    title: "Über ein Thema sprechen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL2",
  },
  instruction: "Ordnen Sie die Gesprächsteile.",
  content: {
    task: "Sprechen Sie über das Thema Urlaub.",
    cards: [{ id: "anna", participant: "Anna", title: "Urlaub", content: "Ich fahre gern ans Meer." }],
    dialogue: [
      { id: "first", sequence: 1, role: "TN1", text: "Was möchtest du im Urlaub machen?" },
      { id: "second", sequence: 2, role: "TN2", text: "Ich möchte wandern." },
    ],
  },
};

const teil1Exercise = {
  id: 47,
  exercise_base: {
    level: "B1",
    title: "Einander kennenlernen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL1",
  },
  instruction: "Stellen Sie sich vor.",
  content: {
    task: "Sprechen Sie über sich.",
    topics: ["Name", "Wohnort"],
    dialogue: [],
  },
};

const teil3MultiSectionExercise = {
  id: 46,
  exercise_base: {
    level: "B1",
    title: "Mehrere Gespräche planen",
    exam_type: "telc",
    exercise_type: "SPEAKING_TEIL3",
  },
  instruction: "Ordnen Sie die Gespräche.",
  content: {
    task: "Planen Sie zwei Termine.",
    sections: [
      {
        id: "first-section",
        type: "Erster Termin",
        turns: [
          { id: "first-a", sequence: 1, role: "TN1", text: "Wann treffen wir uns?" },
          { id: "first-b", sequence: 2, role: "TN2", text: "Am Montag." },
        ],
      },
      {
        id: "second-section",
        type: "Zweiter Termin",
        turns: [
          { id: "second-a", sequence: 1, role: "TN1", text: "Wo treffen wir uns?" },
          { id: "second-b", sequence: 2, role: "TN2", text: "Am Bahnhof." },
        ],
      },
    ],
  },
};

const b2Teil3DirectExercise = {
  id: 48,
  exercise_base: {
    level: "B2",
    title: "Gemeinsam etwas planen",
    exam_type: "TELC",
    exercise_type: "SPEAKING_TEIL3",
  },
  instruction: "Sprechen Sie gemeinsam über die Planung.",
  content: {
    task: "Planen Sie gemeinsam.",
    sections: [
      {
        type: "Reise",
        turns: [
          { id: "travel-1", sequence: 1, role: "TN1", text: "Wohin fahren wir?", sentence_type: "Reise", audio_url: "/audio/48-1.mp3" },
          { id: "travel-3", sequence: 3, role: "TN1", text: "Wie lange bleiben wir?", sentence_type: "Reise", audio_url: "/audio/48-3.mp3" },
        ],
      },
      {
        type: "Termin",
        turns: [
          { id: "date-2", sequence: 2, role: "TN2", text: "Am Montag.", sentence_type: "Termin", audio_url: "/audio/48-2.mp3" },
          { id: "date-4", sequence: 4, role: "TN2", text: "Das passt gut.", sentence_type: "Termin", audio_url: "/audio/48-4.mp3" },
        ],
      },
    ],
    dialogue: [
      { id: "travel-1", sequence: 1, role: "TN1", text: "Wohin fahren wir?", sentence_type: "Reise", audio_url: "/audio/48-1.mp3" },
      { id: "date-2", sequence: 2, role: "TN2", text: "Am Montag.", sentence_type: "Termin", audio_url: "/audio/48-2.mp3" },
      { id: "travel-3", sequence: 3, role: "TN1", text: "Wie lange bleiben wir?", sentence_type: "Reise", audio_url: "/audio/48-3.mp3" },
      { id: "date-4", sequence: 4, role: "TN2", text: "Das passt gut.", sentence_type: "Termin", audio_url: "/audio/48-4.mp3" },
    ],
  },
};

describe("SpeakingTeilExercisePage text annotations", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() });
    fetchSpeakingTurnStates.mockResolvedValue({ results: [] });
    saveSpeakingTurnState.mockResolvedValue({});
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete window.Highlight;
    delete window.CSS;
  });

  function renderPage(teil, exerciseId) {
    return render(
      <MemoryRouter initialEntries={[`/exercise/${exerciseId}`]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<SpeakingTeilExercisePage teil={teil} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it.each([
    [1, "The C1 presentation sample.", "sample-1a.mp3"],
    [2, "The C1 summary sample.", "sample-1b.mp3"],
  ])("renders C1 Teil %s answer audio turns for shadowing", async (teil, text, audioUrl) => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 70 + teil,
      exercise_base: { level: "C1", title: "C1 practice", exam_type: "TELC", exercise_type: `SPEAKING_TEIL${teil}` },
      instruction: "Üben Sie die Antwort.",
      content: {
        teil: teil === 1 ? "1A" : "1B",
        outline: ["Point one"],
        sample_de: text,
        dialogue: [{ sequence: 1, role: "TN1", text, translation_zh: "不应显示的翻译", audio_url: audioUrl }],
      },
    });
    const { container } = renderPage(teil, 70 + teil);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `record c1-teil-${teil}-${70 + teil}-1` })).toHaveAttribute("data-audio-url", audioUrl);
    expect(screen.getByRole("button", { name: "隐藏答案" })).toHaveAttribute("title", "隐藏答案");
    expect(screen.queryByText("不应显示的翻译")).not.toBeInTheDocument();
    const turn = container.querySelector(".speaking-detail-turn");
    const practice = turn.querySelector(".speaking-detail-turn__practice");
    const controls = practice.querySelector(".shadowing-practice-buttons");
    const recorder = within(practice).getByRole("button", { name: `record c1-teil-${teil}-${70 + teil}-1` });
    const sampleAudio = within(controls).getByRole("button", { name: "朗读" });
    const translationToggle = within(practice).getByRole("button", { name: "显示中文翻译" });
    const favorite = within(practice).getByRole("button", { name: "收藏句子" });
    expect(translationToggle).toHaveTextContent(/^Aa$/);
    expect(translationToggle).toHaveAttribute("title", "翻译");
    expect(translationToggle).toHaveAttribute("aria-pressed", "false");
    expect(controls).toContainElement(translationToggle);
    expect(sampleAudio.compareDocumentPosition(translationToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recorder.compareDocumentPosition(translationToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(translationToggle.compareDocumentPosition(favorite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(translationToggle);
    expect(turn).toHaveTextContent("不应显示的翻译");
    const hideTranslation = within(practice).getByRole("button", { name: "隐藏中文翻译" });
    expect(hideTranslation).toHaveTextContent(/^Aa$/);
    expect(hideTranslation).toHaveAttribute("title", "翻译");
    expect(hideTranslation).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hideTranslation);
    expect(screen.queryByText("不应显示的翻译")).not.toBeInTheDocument();
    expect(container.querySelector(".speaking-detail-c1-translation-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prüfen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wiederholen" })).not.toBeInTheDocument();
  });

  it("shows the C1 Teil 1A outline beside the sample answer", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 71,
      exercise_base: { level: "C1", title: "C1 Vortrag", exam_type: "TELC", exercise_type: "SPEAKING_TEIL1" },
      instruction: "Halten Sie einen Vortrag.",
      content: {
        teil: "1A",
        topic: "Nachhaltige Mobilität",
        outline: ["Ausgangslage", "Mögliche Lösungen\nund ihre Folgen"],
        dialogue: [{ sequence: 1, role: "TN1", text: "Zuerst möchte ich die Situation beschreiben.", audio_url: "/audio/c1-vortrag.mp3" }],
      },
    });
    renderPage(1, 71);

    const outline = await screen.findByRole("heading", { name: "提纲" });
    const answer = screen.getByText("Zuerst möchte ich die Situation beschreiben.");
    expect(outline.closest(".speaking-detail-card").parentElement).toBe(answer.closest(".speaking-detail-card").parentElement);
    expect(answer.closest(".speaking-detail-card")).toHaveClass("speaking-detail-c1-answer");
    expect(screen.getByText("Nachhaltige Mobilität")).toBeInTheDocument();
    expect(screen.getByText("Ausgangslage")).toBeInTheDocument();
    const outlineContent = screen.getByText((_, element) => element?.classList.contains("speaking-detail-c1-outline__content"));
    expect(Array.from(outlineContent.querySelectorAll("p"), (point) => point.textContent)).toContain("Mögliche Lösungen\nund ihre Folgen");
    expect(screen.getByRole("button", { name: "record c1-teil-1-71-1" })).toHaveAttribute("data-audio-url", "/audio/c1-vortrag.mp3");
    expect(screen.getByRole("button", { name: "隐藏提纲" })).toHaveAttribute("title", "隐藏提纲");
    expect(screen.getByRole("button", { name: "隐藏答案" })).toHaveAttribute("title", "隐藏答案");
    expect(screen.queryByRole("button", { name: "Prüfen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wiederholen" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "隐藏提纲" }));
    expect(screen.getByRole("heading", { name: "提纲" })).toBeInTheDocument();
    expect(screen.queryByText("Ausgangslage")).not.toBeInTheDocument();
    expect(screen.getByText("Zuerst möchte ich die Situation beschreiben.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "显示提纲" })).toHaveAttribute("title", "显示提纲");

    fireEvent.click(screen.getByRole("button", { name: "显示提纲" }));
    expect(screen.getByText("Ausgangslage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "隐藏答案" }));
    expect(screen.getByRole("heading", { name: "Beispielantwort" })).toBeInTheDocument();
    expect(screen.queryByText("Zuerst möchte ich die Situation beschreiben.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "record c1-teil-1-71-1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏句子" })).not.toBeInTheDocument();
    expect(screen.getByText("Ausgangslage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "显示答案" })).toHaveAttribute("title", "显示答案");

    fireEvent.click(screen.getByRole("button", { name: "显示答案" }));
    expect(screen.getByText("Zuerst möchte ich die Situation beschreiben.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "record c1-teil-1-71-1" })).toBeInTheDocument();
    expect(screen.getByText("Ausgangslage")).toBeInTheDocument();
  });

  it("renders complete C1 Teil 1B content vertically with plain-text line breaks", async () => {
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{ turn_key: "turn:8", is_favorited: true }] });
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 75,
      exercise_base: { level: "C1", title: "C1 Vortrag", exam_type: "TELC", exercise_type: "SPEAKING_TEIL2" },
      instruction: "Halten Sie einen Vortrag.",
      content: {
        teil: "1B",
        topic: "Digitales Lernen",
        outline: ["Vorteile", "Herausforderungen"],
        dialogue: [
          { sequence: 1, turn_key: "turn:source:71:4", source_teil: 1, source_exercise_id: 71, source_sequence: 4, role: "TN1", text: "Zunächst möchte ich das Thema vorstellen.<br />Danach nenne ich Vorteile.", audio_url: "/audio/c1-1b-1.mp3" },
          { sequence: 2, turn_key: "turn:8", source_teil: 2, source_exercise_id: 75, source_sequence: 8, role: "TN2", text: "Welche Vorteile sind besonders wichtig?", audio_url: "/audio/c1-1b-2.mp3" },
          { sequence: 3, turn_key: "turn:9", source_teil: 2, source_exercise_id: 75, source_sequence: 9, role: "TN1", text: "Vor allem die zeitliche Flexibilität.", audio_url: "/audio/c1-1b-3.mp3" },
        ],
      },
    });
    renderPage(2, 75);

    const taskCard = (await screen.findByRole("heading", { name: "Teil 1a + Teil 1b" })).closest(".speaking-detail-card");
    const answerCard = screen.getByRole("heading", { name: "Beispielantwort" }).closest(".speaking-detail-card");
    const layout = taskCard.parentElement;
    expect(layout).toHaveClass("speaking-detail-c1-layout--teil-2");
    expect(layout).not.toHaveClass("speaking-detail-c1-layout--teil-1");
    const speakingCss = readFileSync("src/pages/SpeakingTeilExercisePage.css", "utf8");
    expect(speakingCss).toMatch(/\.speaking-detail-c1-layout--teil-2\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*gap:\s*1rem;\s*\}/);
    expect(taskCard.compareDocumentPosition(answerCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(taskCard).getByText("Digitales Lernen")).toBeInTheDocument();
    expect(within(taskCard).getByRole("heading", { name: "提纲" })).toBeInTheDocument();

    const turns = Array.from(answerCard.querySelectorAll(".speaking-detail-turn"));
    expect(turns.map((turn) => turn.querySelector(".speaking-detail-turn__role").textContent)).toEqual(["TN1", "TN2", "TN1"]);
    const firstTurnText = turns[0].querySelector("p").textContent;
    expect(firstTurnText).toBe("Zunächst möchte ich das Thema vorstellen.\nDanach nenne ich Vorteile.");
    expect(firstTurnText).not.toContain("<br");
    expect(screen.getAllByRole("button", { name: /^record c1-teil-/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "record c1-teil-1-71-4",
      "record c1-teil-2-75-8",
      "record c1-teil-2-75-9",
    ]);
    const favorites = within(answerCard).getAllByRole("button", { name: "收藏句子" });
    expect(favorites).toHaveLength(3);
    expect(favorites.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    fireEvent.click(favorites[0]);
    fireEvent.click(favorites[1]);
    fireEvent.click(favorites[2]);
    await waitFor(() => {
      expect(saveSpeakingTurnState).toHaveBeenCalledWith({ exercise: 75, turn_key: "turn:source:71:4", is_favorited: true });
      expect(saveSpeakingTurnState).toHaveBeenCalledWith({ exercise: 75, turn_key: "turn:8", is_favorited: false });
      expect(saveSpeakingTurnState).toHaveBeenCalledWith({ exercise: 75, turn_key: "turn:9", is_favorited: true });
    });

    fireEvent.click(screen.getByRole("button", { name: "隐藏提纲" }));
    expect(within(taskCard).queryByText("Vorteile")).not.toBeInTheDocument();
    expect(within(answerCard).getByText(/Zunächst möchte ich/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "显示提纲" }));
    expect(within(taskCard).getByText("Vorteile")).toBeInTheDocument();
  });

  it("converts legacy breaks in displayed C1 model translations to newlines", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 76,
      exercise_base: { level: "C1", title: "C1 Diskussion", exam_type: "TELC", exercise_type: "SPEAKING_TEIL3" },
      instruction: "Diskutieren Sie.",
      content: {
        dialogue: [{ sequence: 1, role: "TN1", text: "Ich stimme zu.", translation_zh: "我同意。<BR/>这是我的理由。", audio_url: "/audio/c1-teil2-1.mp3" }],
      },
    });
    renderPage(3, 76);

    fireEvent.click(await screen.findByRole("button", { name: "显示中文翻译" }));
    const translation = screen.getByText((_, element) => element?.classList.contains("speaking-detail-turn__translation"));
    expect(translation.textContent).toBe("我同意。\n这是我的理由。");
    expect(translation.textContent).not.toContain("<BR");
  });

  it.each([
    ["missing", undefined],
    ["empty string", ""],
    ["empty array", []],
  ])("does not render C1 outline controls for a %s outline", async (_, outline) => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 74,
      exercise_base: { level: "C1", title: "C1 Vortrag", exam_type: "TELC", exercise_type: "SPEAKING_TEIL1" },
      instruction: "Halten Sie einen Vortrag.",
      content: outline === undefined ? {} : { outline },
    });
    renderPage(1, 74);

    await screen.findByRole("heading", { name: "Teil 1A" });
    expect(screen.queryByRole("heading", { name: "提纲" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "隐藏提纲" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "显示提纲" })).not.toBeInTheDocument();
  });

  it("preserves line breaks in a string C1 outline", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 72,
      exercise_base: { level: "C1", title: "C1 Vortrag", exam_type: "TELC", exercise_type: "SPEAKING_TEIL1" },
      instruction: "Halten Sie einen Vortrag.",
      content: { outline: "Erster Punkt\nZweiter Punkt", sample_de: "Beispielantwort" },
    });
    renderPage(1, 72);

    const outlineContent = await screen.findByText((_, element) => element?.classList.contains("speaking-detail-c1-outline__content"));
    expect(outlineContent.textContent).toBe("Erster Punkt\nZweiter Punkt");
    expect(outlineContent).toHaveClass("speaking-detail-c1-outline__content");
    expect(screen.queryByRole("button", { name: "Prüfen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wiederholen" })).not.toBeInTheDocument();
  });

  it("renders translated C1 Teil 2 quotation and audio controls for every model turn", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      id: 73,
      exercise_base: { level: "C1", title: "C1 Diskussion", exam_type: "TELC", exercise_type: "SPEAKING_TEIL3" },
      instruction: "Diskutieren Sie über das Zitat.",
      content: {
        quotes: [{ text: "Bildung ist die mächtigste Waffe.", translation_zh: "教育是最强大的武器。" }],
        dialogue: [
          { sequence: 1, role: "TN1", text: "Ich stimme diesem Zitat zu.", translation_zh: "我赞同这句引言。", audio_url: "/audio/c1-diskussion-1.mp3" },
          { sequence: 2, role: "TN2", text: "Das sehe ich etwas anders.", translation_zh: "我的看法有些不同。", audio_url: "/audio/c1-diskussion-2.mp3" },
        ],
      },
    });
    const { container } = renderPage(3, 73);

    expect(await screen.findByText("Bildung ist die mächtigste Waffe.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "record c1-teil-3-73-1" })).toHaveAttribute("data-audio-url", "/audio/c1-diskussion-1.mp3");
    expect(screen.getByRole("button", { name: "record c1-teil-3-73-2" })).toHaveAttribute("data-audio-url", "/audio/c1-diskussion-2.mp3");
    expect(container.querySelector(".speaking-detail-c1-quote")).toBeInTheDocument();
    expect(screen.queryByText("对话排序")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "隐藏答案" })).toBeInTheDocument();
    expect(screen.queryByText("我赞同这句引言。")).not.toBeInTheDocument();
    expect(screen.queryByText("我的看法有些不同。")).not.toBeInTheDocument();
    const answerContent = container.querySelector(".speaking-detail-c1-answer__content");
    const turns = Array.from(answerContent.querySelectorAll(".speaking-detail-turn"));
    const translationToggles = turns.map((turn) => within(turn.querySelector(".speaking-detail-turn__practice")).getByRole("button", { name: "显示中文翻译" }));
    expect(translationToggles).toHaveLength(2);
    translationToggles.forEach((toggle, index) => {
      const practice = turns[index].querySelector(".speaking-detail-turn__practice");
      const controls = practice.querySelector(".shadowing-practice-buttons");
      const sampleAudio = within(controls).getByRole("button", { name: "朗读" });
      const favorite = within(practice).getByRole("button", { name: "收藏句子" });
      expect(toggle).toHaveTextContent(/^Aa$/);
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      expect(toggle).toHaveAttribute("title", "翻译");
      expect(controls).toContainElement(toggle);
      expect(sampleAudio.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(toggle.compareDocumentPosition(favorite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(container.querySelector(".speaking-detail-c1-translation-actions")).not.toBeInTheDocument();

    fireEvent.click(translationToggles[0]);
    expect(turns[0]).toHaveTextContent("我赞同这句引言。");
    expect(turns[1]).not.toHaveTextContent("我的看法有些不同。");

    fireEvent.click(translationToggles[1]);
    expect(turns[0]).toHaveTextContent("我赞同这句引言。");
    expect(turns[1]).toHaveTextContent("我的看法有些不同。");

    const hideFirstTranslation = within(turns[0]).getByRole("button", { name: "隐藏中文翻译" });
    expect(hideFirstTranslation).toHaveAttribute("title", "翻译");
    fireEvent.click(hideFirstTranslation);
    expect(turns[0]).not.toHaveTextContent("我赞同这句引言。");
    expect(turns[1]).toHaveTextContent("我的看法有些不同。");

    fireEvent.click(screen.getByRole("button", { name: "隐藏答案" }));
    fireEvent.click(screen.getByRole("button", { name: "显示答案" }));
    expect(screen.queryByText("我赞同这句引言。")).not.toBeInTheDocument();
    expect(screen.getByText("我的看法有些不同。")).toBeInTheDocument();
    fireEvent.click(within(screen.getByText("我的看法有些不同。").closest(".speaking-detail-turn")).getByRole("button", { name: "隐藏中文翻译" }));
    expect(screen.queryByText("我的看法有些不同。")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prüfen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wiederholen" })).not.toBeInTheDocument();
  });

  it("hides only the task text for TELC B2 Sprechen Teil 1", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      ...teil1Exercise,
      exercise_base: { ...teil1Exercise.exercise_base, level: " b2 ", exam_type: " TELC " },
    });
    renderPage(1, 47);

    expect(await screen.findByText("Stellen Sie sich vor.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Präsentation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Einander kennenlernen" })).not.toBeInTheDocument();
    expect(screen.queryByText("Sprechen Sie über sich.")).not.toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("keeps the task text for B1 Sprechen Teil 1", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil1Exercise);
    renderPage(1, 47);

    expect(await screen.findByText("Stellen Sie sich vor.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Einander kennenlernen" })).toBeInTheDocument();
    expect(screen.getByText("Sprechen Sie über sich.")).toBeInTheDocument();
  });

  it("hides the task text for TELC B2 Sprechen Teil 2", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      ...teil2Exercise,
      exercise_base: { ...teil2Exercise.exercise_base, level: "B2", exam_type: "TELC" },
    });
    renderPage(2, 45);

    expect(await screen.findByText("Ordnen Sie die Gesprächsteile.")).toBeInTheDocument();
    expect(screen.queryByText("Sprechen Sie über das Thema Urlaub.")).not.toBeInTheDocument();
  });

  it("shows TELC B2 Teil 2 examiner turns above and excludes them from sorting", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue({
      ...teil2Exercise,
      exercise_base: { ...teil2Exercise.exercise_base, level: "B2", exam_type: "TELC" },
      content: {
        ...teil2Exercise.content,
        dialogue: [
          { id: "examiner", sequence: 1, role: "Prüfer/in", text: "Sprechen Sie über das Thema." },
          { id: "first", sequence: 2, role: "TN1", text: "Was möchtest du im Urlaub machen?" },
          { id: "second", sequence: 3, role: "TN2", text: "Ich möchte wandern." },
        ],
      },
    });
    const { container } = renderPage(2, 45);

    expect(await screen.findByText("Sprechen Sie über das Thema.")).toBeInTheDocument();
    expect(container.querySelector(".speaking-detail-examiner-turns")).toHaveTextContent("Prüfer/in");
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    expect(screen.getAllByText("Prüfer/in")).toHaveLength(1);
    expect(container.querySelector(".speaking-dialogue-pools")).not.toHaveTextContent("Prüfer/in");
  });

  it("hides the task text for TELC B2 Sprechen Teil 3", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(b2Teil3DirectExercise);
    renderPage(3, 48);

    expect(await screen.findByText("Sprechen Sie gemeinsam über die Planung.")).toBeInTheDocument();
    expect(screen.queryByText("Planen Sie gemeinsam.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prüfen" })).not.toBeInTheDocument();
    expect(screen.queryByText("对话排序")).not.toBeInTheDocument();
    expect(screen.getAllByText("Wohin fahren wir?")).toHaveLength(1);
    expect(screen.getAllByText("Am Montag.")).toHaveLength(1);
    expect(screen.getAllByText("Wie lange bleiben wir?")).toHaveLength(1);
    expect(screen.getAllByText("Das passt gut.")).toHaveLength(1);
    expect(screen.getAllByText("Reise")).toHaveLength(2);
    expect(screen.getAllByText("Termin")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "record teil-3-48-0-1" })).toHaveAttribute("data-audio-url", "/audio/48-1.mp3");
    expect(screen.getByRole("button", { name: "record teil-3-48-1-2" })).toHaveAttribute("data-audio-url", "/audio/48-2.mp3");
    expect(screen.getByRole("button", { name: "record teil-3-48-0-3" })).toHaveAttribute("data-audio-url", "/audio/48-3.mp3");
    expect(screen.getByRole("button", { name: "record teil-3-48-1-4" })).toHaveAttribute("data-audio-url", "/audio/48-4.mp3");
    const texts = Array.from(document.querySelectorAll(".speaking-detail-turn p")).map((element) => element.textContent);
    expect(texts).toEqual(["Wohin fahren wir?", "Am Montag.", "Wie lange bleiben wir?", "Das passt gut."]);
  });

  it("uses the real speaking scope, registers learning content, and excludes controls", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil3Exercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{
      turn_key: "dialogue-order:section:0",
      answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
    }] });
    renderPage(3, 44);

    expect((await screen.findByText("Ordnen Sie den Dialog.")).closest("[data-exam-annotation-region]"))
      .toHaveAttribute("data-exam-annotation-region", "task");
    expect(screen.getByText("Planen Sie gemeinsam einen Ausflug.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute("data-exam-annotation-region", "material:task");
    expect(screen.getByText("Ausflug", { selector: '[data-exam-annotation-region="section:trip"]' }))
      .toHaveAttribute("data-exam-annotation-region", "section:trip");
    expect(screen.getByText("Wann treffen wir uns?", { selector: '[data-exam-annotation-region="turn:first"]' }))
      .toHaveAttribute("data-exam-annotation-region", "turn:first");

    expect(screen.getByRole("link", { name: /Zurück zu Sprechen/ }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getAllByRole("button", { name: "Weiter →" })[0].closest("[data-exam-annotation-region]"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "record teil-3-44-0-1" }).closest("[data-exam-annotation-region]"))
      .toBeNull();
  });

  it("keeps marks after Prüfen and clears only this exercise on Wiederholen", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL2", 45);
    const unrelatedScope = exerciseAnnotationScope("SPEAKING_TEIL3", 44);
    sessionStorage.setItem(unrelatedScope, JSON.stringify({
      version: 1,
      regions: { task: [{ start: 0, end: 4, highlight: true, underline: false }] },
    }));
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil2Exercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{
      turn_key: "dialogue-order:all",
      answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: false },
    }] });
    renderPage(2, 45);

    const task = await screen.findByText("Sprechen Sie über das Thema Urlaub.");
    selectText(task, 0, 8);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["material:task"]).toEqual([{
      start: 0,
      end: 8,
      highlight: true,
      underline: false,
    }]);

    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["material:task"]).toHaveLength(1);
    expect(screen.getByText("Was möchtest du im Urlaub machen?", { selector: '[data-exam-annotation-region="explanation:first"]' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" })).toBeInTheDocument();
  });

  it("keeps section ordering actions intact and reveals annotated complete dialogue", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL3", 44);
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil3Exercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [{
      turn_key: "dialogue-order:section:0",
      answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
    }] });
    renderPage(3, 44);

    const allDialogues = await screen.findAllByText("Wann treffen wir uns?");
    expect(allDialogues.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "展示全部完整对话" }));
    expect(screen.getByText("Wann treffen wir uns?", { selector: '[data-exam-annotation-region="explanation:full:first"]' }))
      .toBeInTheDocument();

    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: { "turn:first": [{ start: 0, end: 4, underline: true, highlight: false }] },
    }));
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
  });

  it("keeps card text selectable while handles preserve touch/desktop ordering and real saves", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL2", 45);
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil2Exercise);
    renderPage(2, 45);

    const firstText = await screen.findByText("Was möchtest du im Urlaub machen?");
    const firstCard = firstText.closest("article");
    const firstHandle = firstCard.querySelector("[data-speaking-drag-handle]");
    expect(firstCard).not.toHaveAttribute("draggable");
    expect(firstHandle).toHaveAttribute("draggable", "true");
    expect(getComputedStyle(firstHandle).touchAction).toBe("none");
    expect(firstText).toHaveClass("speaking-dialogue-card__text");
    expect(getComputedStyle(firstText).userSelect).toBe("text");
    expect(getComputedStyle(firstText).touchAction).toBe("auto");

    selectText(firstText, 0, 4);
    act(() => document.dispatchEvent(new Event("selectionchange")));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions["turn:first"]).toEqual([{
      start: 0,
      end: 4,
      highlight: true,
      underline: false,
    }]);

    const textPointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(textPointerDown, {
      pointerId: { value: 11 },
      pointerType: { value: "touch" },
      clientX: { value: 20 },
      clientY: { value: 20 },
    });
    firstText.dispatchEvent(textPointerDown);
    expect(textPointerDown.defaultPrevented).toBe(false);
    expect(firstCard).not.toHaveClass("is-dragging");
    const textDragStart = new Event("dragstart", { bubbles: true, cancelable: true });
    firstText.dispatchEvent(textDragStart);
    expect(textDragStart.defaultPrevented).toBe(false);
    const textPointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(textPointerUp, "pointerId", { value: 11 });
    firstText.dispatchEvent(textPointerUp);

    const dropTarget = screen.getByText("请拖拽上面的对话到此处");
    const originalElementFromPoint = document.elementFromPoint;
    const elementFromPoint = vi.fn().mockReturnValue(dropTarget);
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
    const handlePointerDown = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(handlePointerDown, {
      pointerId: { value: 12 },
      pointerType: { value: "touch" },
      clientX: { value: 20 },
      clientY: { value: 200 },
    });
    firstHandle.dispatchEvent(handlePointerDown);
    expect(handlePointerDown.defaultPrevented).toBe(true);
    const handlePointerMove = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.defineProperties(handlePointerMove, {
      pointerId: { value: 12 },
      pointerType: { value: "touch" },
      clientX: { value: 20 },
      clientY: { value: 220 },
    });
    act(() => firstHandle.dispatchEvent(handlePointerMove));
    await waitFor(() => expect(firstCard).toHaveClass("is-dragging"));
    const handlePointerUp = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(handlePointerUp, "pointerId", { value: 12 });
    act(() => firstHandle.dispatchEvent(handlePointerUp));
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: originalElementFromPoint });
    await screen.findByText("Was möchtest du im Urlaub machen?", { selector: '[data-exam-annotation-region="turn:first"]' });

    const secondText = screen.getByText("Ich möchte wandern.");
    const secondHandle = secondText.closest("article").querySelector("[data-speaking-drag-handle]");
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue("turn:2"),
    };
    fireEvent.dragStart(secondHandle, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "turn:2");
    fireEvent.drop(screen.getAllByText("插入这里").at(-1), { dataTransfer });
    await screen.findByText("Ich möchte wandern.", { selector: '[data-exam-annotation-region="turn:second"]' });

    const checkButton = screen.getByRole("button", { name: "Prüfen" });
    expect(checkButton).not.toBeDisabled();
    fireEvent.click(checkButton);
    await waitFor(() => expect(saveSpeakingTurnState).toHaveBeenCalledWith({
      exercise: 45,
      turn_key: "dialogue-order:all",
      answer_payload: {
        ordered_turn_keys: ["turn:1", "turn:2"],
        is_checked: true,
      },
      is_correct: true,
    }));
  });

  it("keeps selected previews role-colored and makes only the TN handle draggable", async () => {
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil2Exercise);
    renderPage(2, 45);

    const firstText = await screen.findByText("Was möchtest du im Urlaub machen?");
    const secondText = screen.getByText("Ich möchte wandern.");
    const handles = Array.from(document.querySelectorAll("[data-speaking-drag-handle]"));
    const draggableElements = Array.from(document.querySelectorAll('[draggable="true"]'));

    expect(handles).toHaveLength(2);
    expect(draggableElements).toEqual(handles);
    handles.forEach((handle) => {
      expect(handle).toHaveClass("speaking-dialogue-card__handle");
      expect(handle).toHaveAttribute("data-speaking-drag-handle", "true");
    });
    expect(firstText).not.toHaveAttribute("draggable");
    expect(firstText).toHaveClass("speaking-dialogue-card__text");

    fireEvent.click(firstText);
    const selectedPreview = document.querySelector(".speaking-dialogue-board__selected");
    expect(selectedPreview).toHaveClass("speaking-dialogue-board__selected--tn1");
    expect(selectedPreview).not.toHaveClass("speaking-dialogue-board__selected--tn2");

    fireEvent.click(secondText);
    expect(selectedPreview).toHaveClass("speaking-dialogue-board__selected--tn2");
    expect(selectedPreview).not.toHaveClass("speaking-dialogue-board__selected--tn1");
  });

  it("resets only the active section answers while clearing all marks for a multi-section exercise", async () => {
    const scope = exerciseAnnotationScope("SPEAKING_TEIL3", 46);
    sessionStorage.setItem(scope, JSON.stringify({
      version: 1,
      regions: {
        task: [{ start: 0, end: 4, highlight: true, underline: false }],
        "turn:first-a": [{ start: 0, end: 4, underline: true, highlight: false }],
      },
    }));
    fetchSpeakingTeilExerciseDetail.mockResolvedValue(teil3MultiSectionExercise);
    fetchSpeakingTurnStates.mockResolvedValue({ results: [
      {
        turn_key: "dialogue-order:section:0",
        answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
      },
      {
        turn_key: "dialogue-order:section:1",
        answer_payload: { ordered_turn_keys: ["turn:1", "turn:2"], is_checked: true },
      },
    ] });
    renderPage(3, 46);

    await screen.findByRole("button", { name: "Wiederholen" });
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    await waitFor(() => expect(sessionStorage.getItem(scope)).toBeNull());
    expect(saveSpeakingTurnState).toHaveBeenCalledWith({
      exercise: 46,
      turn_key: "dialogue-order:section:0",
      answer_payload: { ordered_turn_keys: [], is_checked: false },
      is_correct: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "进入第 2 个对话段落：Zweiter Termin" }));
    await screen.findByRole("button", { name: "Wiederholen" });
    expect(screen.getByText("Wo treffen wir uns?", { selector: '[data-exam-annotation-region="turn:second-a"]' }))
      .toBeInTheDocument();
  });
});
