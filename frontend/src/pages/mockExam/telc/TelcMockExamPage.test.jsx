import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import TelcMockExamPage from "./TelcMockExamPage.jsx";
import TelcMockExamAnswerSheet from "./TelcMockExamAnswerSheet.jsx";
import { mockAnnotationScope } from "../../../utils/examTextAnnotations.js";
import {
  activeMockExamKey,
  createMockExam,
  fetchSavedMockExam,
  submitSavedMockExam,
  updateSavedMockExam,
} from "../../../api/exam_preparation/mockExams.js";

function expectVocabularyCard(container, term, translation) {
  const card = container.querySelector(".exam-vocabulary-card");
  expect(card).toBeInTheDocument();
  expect(within(card).getByRole("heading", { name: term })).toBeInTheDocument();
  expect(within(card).getByText(translation)).toBeInTheDocument();
}

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

const mockExamStyleSource = readFileSync(resolve("src/pages/mockExam/telc/TelcMockExamPage.css"), "utf8");
const clozeExerciseStyleSource = readFileSync(resolve("src/pages/ClozeExercisePage.css"), "utf8");
const appLayoutStyleSource = readFileSync(resolve("src/layouts/AppLayout.css"), "utf8");
const readingAdStyleSource = readFileSync(resolve("src/pages/ReadingAdMatchingPage.css"), "utf8");
const writingDetailStyleSource = readFileSync(resolve("src/pages/ExamPreparationWritingDetailPage.css"), "utf8");

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

vi.mock("../../../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));

vi.mock("../../../utils/confirmMockExamAction.js", () => ({
  confirmMockExamAction: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../../api/exam_preparation/mockExams.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createMockExam: vi.fn(),
    fetchSavedMockExam: vi.fn(),
    saveMockExam: vi.fn(),
    submitSavedMockExam: vi.fn(),
    updateSavedMockExam: vi.fn(),
  };
});

function answerSheetExam() {
  return {
    parts: {
      reading_understanding: {
        exercise_base: { title: "Lesen 2", exam_type: "telc" },
        text_markdown: "Lesetext",
        questions: [{
          id: 101,
          question_number: 1,
          question_text: "Lesefrage",
          answer_options: [
            { id: 1, option_key: "A", option_text: "A", is_correct: true },
            { id: 2, option_key: "B", option_text: "B", is_correct: false },
          ],
        }],
      },
      listening_teil1: {
        exercise_base: { title: "Hören 1", exam_type: "telc" },
        questions: [{
          id: 201,
          question_number: 1,
          question_text: "Hörfrage",
          answer_options: [
            { id: 3, option_key: "A", option_text: "A", is_correct: true },
            { id: 4, option_key: "B", option_text: "B", is_correct: false },
          ],
        }],
      },
    },
  };
}

function continuousNumberingExam() {
  return {
    parts: {
      reading_title_matching: {
        exercise_base: { title: "Lesen 1", exam_type: "telc" },
        options: [
          { id: 1, option_key: "A", option_text: "Titel A" },
          { id: 2, option_key: "B", option_text: "Titel B" },
        ],
        items: [
          { id: 11, item_number: 1, text: "Text eins", correct_option: { option_key: "A", option_text: "Titel A" } },
          { id: 12, item_number: 2, text: "Text zwei", correct_option: { option_key: "B", option_text: "Titel B" } },
        ],
      },
      reading_understanding: {
        exercise_base: { title: "Lesen 2", exam_type: "telc" },
        text_markdown: "Lesetext",
        questions: [{
          id: 21,
          question_number: 1,
          question_text: "Verstehen",
          answer_options: [{ id: 21, option_key: "A", option_text: "Ja", is_correct: true }],
        }],
      },
      reading_ad_matching: {
        exercise_base: { title: "Lesen 3", exam_type: "telc" },
        ads: [{ id: 31, ad_key: "a", ad_text_markdown: "Anzeige", is_no_match_option: false }],
        items: [{
          id: 31,
          item_number: 1,
          item_text: "Situation drei",
          correct_ad: { ad_key: "a" },
        }],
      },
      cloze_choice: {
        exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
        content_with_placeholders: "Ich {{blank_1}} heute.",
        blanks: [{
          id: 41,
          blank_key: "blank_1",
          blank_number: 1,
          options: [{ id: 41, option_key: "A", option_text: "lerne", is_correct: true }],
        }],
      },
      cloze_matching: {
        exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
        content_with_placeholders: "Wir {{blank_1}} heute.",
        options: [{ id: 51, option_key: "option_1", option_text: "lernen" }],
        blank_answers: [{
          id: 51,
          blank_key: "blank_1",
          blank_number: 1,
          correct_option: { option_key: "option_1", option_text: "lernen" },
        }],
      },
      listening_teil1: {
        exercise_base: { title: "Hören 1", exam_type: "telc" },
        listening_type: "short_text_true_false_with_prep",
        questions: [{
          id: 61,
          question_number: 1,
          question_text: "Hörfrage",
          answer_options: [{ id: 61, option_key: "A", option_text: "Richtig", is_correct: true }],
        }],
      },
    },
  };
}

function listeningRangeExam() {
  const matchingOptions = Array.from({ length: 40 }, (_, index) => ({
    id: 1000 + index,
    option_key: `option_${index + 1}`,
    option_text: `Option ${index + 1}`,
  }));
  const listeningQuestions = (startId, count) => Array.from({ length: count }, (_, index) => ({
    id: startId + index,
    question_number: index + 1,
    question_text: `Hörfrage ${index + 1}`,
    answer_options: [
      { id: startId * 10 + index * 2, option_key: "A", option_text: "Richtig", is_correct: true },
      { id: startId * 10 + index * 2 + 1, option_key: "B", option_text: "Falsch", is_correct: false },
    ],
  }));
  return {
    parts: {
      cloze_matching: {
        exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
        content_with_placeholders: "",
        options: matchingOptions,
        blank_answers: matchingOptions.map((option, index) => ({
          id: 2000 + index,
          blank_key: `blank_${index + 1}`,
          blank_number: index + 1,
          correct_option: option,
        })),
      },
      listening_teil1: {
        exercise_base: { title: "Hören 1", exam_type: "telc" },
        instruction: "Entscheiden Sie bei den Aufgaben 1 - 5, ob die Aussagen richtig oder falsch sind. Lesen Sie jetzt die Aufgaben 1 - 5.",
        questions: listeningQuestions(3000, 5),
      },
      listening_teil2: {
        exercise_base: { title: "Hören 2", exam_type: "telc" },
        instruction: "Entscheiden Sie bei den Aufgaben 6 - 15, ob die Aussagen richtig oder falsch sind.",
        questions: listeningQuestions(4000, 10),
      },
      listening_teil3: {
        exercise_base: { title: "Hören 3", exam_type: "telc" },
        instruction: "Entscheiden Sie bei den Aufgaben 16 - 20, ob die Aussagen richtig oder falsch sind.",
        questions: listeningQuestions(5000, 5),
      },
    },
  };
}

function mockExamState(partKey, exercise, phase = "reading") {
  const audioStep = {
    listening_teil1: 0,
    listening_teil2: 2,
    listening_teil3: 4,
  }[partKey] || 0;
  return {
    exam: { parts: { [partKey]: exercise } },
    phase,
    deadline: Date.now() + 60_000,
    activePart: partKey,
    answers: {},
    writingText: "",
    writingAssessment: {},
    audioStep,
    audioStepStartedAt: phase === "listening" ? Date.now() : 0,
    attemptId: null,
    isFavorite: false,
    wasEarlySubmitted: false,
  };
}

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
  document.dispatchEvent(new Event("selectionchange"));
}

function selectAcrossText(startElement, startOffset, endElement, endOffset) {
  const textNode = (element, last = false) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (!last) return first;
    let result = first;
    let node;
    while ((node = walker.nextNode())) result = node;
    return result;
  };
  const range = document.createRange();
  range.setStart(textNode(startElement), startOffset);
  range.setEnd(textNode(endElement, true), endOffset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

afterEach(() => {
  delete window.Highlight;
  delete window.CSS;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
  else delete URL.createObjectURL;
  if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
  else delete URL.revokeObjectURL;
});

describe("mock exam answer sheet", () => {
  let styleElement;

  beforeAll(() => {
    styleElement = document.createElement("style");
    styleElement.textContent = mockExamStyleSource;
    document.head.append(styleElement);
  });

  afterAll(() => styleElement.remove());

  it("can collapse and expand its answer controls", () => {
    render(<TelcMockExamAnswerSheet
      rows={[{
        answerKey: "reading_understanding:101",
        partLabel: "Lesen · Teil 2",
        group: "reading",
        number: 1,
        optionKeys: ["A", "B"],
        correctKey: "A",
        editable: true,
      }]}
      answers={{}}
      onAnswer={() => {}}
      review={false}
    />);

    const collapse = screen.getByRole("button", { name: "收起答题卡" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "第 1 题，答案 A" })).toBeInTheDocument();

    fireEvent.click(collapse);

    const expand = screen.getByRole("button", { name: "展开答题卡" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "第 1 题，答案 A" })).not.toBeInTheDocument();

    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "第 1 题，答案 A" })).toBeInTheDocument();
  });

  it("gives Sprachbausteine Teil 2 a full row and spreads its options across the available width", () => {
    render(<TelcMockExamAnswerSheet
      rows={[
        {
          answerKey: "reading_understanding:101",
          partLabel: "Lesen · Teil 2",
          group: "reading",
          number: 1,
          optionKeys: ["A", "B"],
          correctKey: "A",
          editable: true,
        },
        {
          answerKey: "cloze_matching:201",
          partLabel: "Sprachbausteine · Teil 2",
          group: "reading",
          number: 1,
          optionKeys: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
          correctKey: "A",
          editable: true,
        },
      ]}
      answers={{}}
      onAnswer={() => {}}
      review={false}
    />);

    const part = screen.getByRole("heading", { name: "Sprachbausteine · Teil 2" })
      .closest(".mock-answer-sheet__part");
    const options = part.querySelector(".mock-answer-sheet__bubbles");

    expect(getComputedStyle(part).gridColumn).toBe("1 / -1");
    expect(getComputedStyle(options).flexWrap).toBe("nowrap");
    expect(getComputedStyle(options).justifyContent).toBe("space-between");
  });

  it("shows only the numeric suffix for Sprachbausteine Teil 2 option keys", () => {
    const onAnswer = vi.fn();
    render(<TelcMockExamAnswerSheet
      rows={[{
        answerKey: "cloze_matching:201",
        partKey: "cloze_matching",
        partLabel: "Sprachbausteine · Teil 2",
        group: "reading",
        number: 21,
        optionKeys: ["option_1", "option_10"],
        correctKey: "option_10",
        editable: true,
      }]}
      answers={{}}
      onAnswer={onAnswer}
      review={false}
    />);

    expect(screen.queryByText("option_1")).not.toBeInTheDocument();
    expect(screen.queryByText("option_10")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "第 21 题，答案 10" }));
    expect(onAnswer).toHaveBeenCalledWith("cloze_matching:201", "option_10");
  });

  it("highlights only the selected Sprachbausteine Teil 2 answer bubble", () => {
    render(<TelcMockExamAnswerSheet
      rows={[{
        answerKey: "cloze_matching:201",
        partKey: "cloze_matching",
        partLabel: "Sprachbausteine · Teil 2",
        group: "reading",
        number: 21,
        optionKeys: ["option_1", "option_10"],
        correctKey: "option_10",
        editable: true,
      }]}
      answers={{ "cloze_matching:201": "option_10" }}
      onAnswer={() => {}}
      review={false}
    />);

    const selected = screen.getByRole("button", { name: "第 21 题，答案 10" });
    const bubble = selected.querySelector("i");

    expect(selected).toHaveClass("is-selected");
    expect(getComputedStyle(selected).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(bubble).boxShadow).not.toBe("none");
  });

  it("shows plus and minus for listening answers while preserving their answer keys", () => {
    const onAnswer = vi.fn();
    render(<TelcMockExamAnswerSheet
      rows={[{
        answerKey: "listening_teil1:301",
        partKey: "listening_teil1",
        partLabel: "Hören · Teil 1",
        group: "listening",
        number: 41,
        options: [
          { optionKey: "A", optionText: "Falsch" },
          { optionKey: "B", optionText: "Richtig" },
        ],
        optionKeys: ["A", "B"],
        correctKey: "B",
        editable: true,
      }]}
      answers={{}}
      onAnswer={onAnswer}
      review={false}
    />);

    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.queryByText("B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "第 41 题，答案 +" }));
    expect(onAnswer).toHaveBeenCalledWith("listening_teil1:301", "B");
    expect(screen.getByRole("button", { name: "第 41 题，答案 −" })).toBeInTheDocument();
  });
});

describe("writing self-assessment", () => {
  let styleElement;

  beforeAll(() => {
    styleElement = document.createElement("style");
    styleElement.textContent = mockExamStyleSource;
    document.head.append(styleElement);
  });

  afterAll(() => styleElement.remove());

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: { parts: { writing: { example_texts: [] } } },
      phase: "writing_review",
      deadline: 0,
      activePart: "writing",
      answers: {},
      writingText: "Meine Antwort",
      writingAssessment: {
        topic_relevant: true,
        task_completion: "A",
        communicative_design: "A",
        formal_accuracy: "A",
      },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: 12,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));
  });

  it("shows only an enabled yellow submit button after completing self-assessment", async () => {
    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const submit = await waitFor(() => {
      const button = container.querySelector(".telc-mock-exam-writing-review__actions button");
      expect(button).toBeInTheDocument();
      return button;
    });
    const review = submit.closest(".telc-mock-exam-writing-review");
    const scrollableContent = review.querySelector(".telc-mock-exam-writing-review__body");

    expect(submit).toBeEnabled();
    expect(submit.parentElement).toHaveClass("telc-mock-exam-writing-review__actions--sticky");
    expect(scrollableContent).toBeInTheDocument();
    expect(scrollableContent).not.toContainElement(submit);
    expect(screen.queryByText("自评已完成，可以提交结算。")).not.toBeInTheDocument();
    expect(screen.queryByText("请完成上方所有自评项后提交")).not.toBeInTheDocument();
    expect(getComputedStyle(submit).backgroundColor).toBe("rgb(242, 189, 97)");
    expect(getComputedStyle(submit).color).toBe("rgb(44, 42, 34)");
  });

  it("shows a gray disabled submit button while self-assessment is incomplete", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.writingAssessment.formal_accuracy = "";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const submit = await waitFor(() => {
      const button = container.querySelector(".telc-mock-exam-writing-review__actions button");
      expect(button).toBeInTheDocument();
      return button;
    });
    expect(submit).toBeDisabled();
    expect(getComputedStyle(submit).backgroundColor).toBe("rgb(216, 221, 218)");
    expect(getComputedStyle(submit).color).toBe("rgb(104, 117, 111)");
  });

  it("labels the imported writing example consistently as Beispieltext", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.exam.parts.writing.example_texts = [{
      id: 91,
      label: "example_text",
      example_text: "Sehr geehrte Damen und Herren",
    }];
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Beispieltext" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "example_text" })).not.toBeInTheDocument();
  });
});

describe("mock exam exercise layout", () => {
  let styleElement;
  let clozeStyleElement;
  let playSpy;
  let pauseSpy;
  let loadSpy;

  beforeAll(() => {
    clozeStyleElement = document.createElement("style");
    clozeStyleElement.textContent = clozeExerciseStyleSource;
    document.head.append(clozeStyleElement);
    styleElement = document.createElement("style");
    styleElement.textContent = mockExamStyleSource;
    document.head.append(styleElement);
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterAll(() => {
    clozeStyleElement.remove();
    styleElement.remove();
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    loadSpy.mockRestore();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    playSpy.mockReset().mockResolvedValue(undefined);
    loadSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url) => successfulAudioResponse(url)));
  });

  it("uses one attempt annotation scope and exposes prefixed learning-text regions", async () => {
    const exercise = {
      exercise_base: { title: "Lesen 2", exam_type: "telc" },
      text_markdown: "Lesetext",
      questions: [{
        id: 101,
        question_number: 1,
        question_text: "Lesefrage",
        answer_options: [{ id: 1, option_key: "A", option_text: "Ja", is_correct: true }],
      }],
    };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      ...mockExamState("reading_understanding", exercise),
      attemptId: 31,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Lesen 2" });
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    expect(document.querySelector('[data-exam-annotation-region="reading_understanding:passage"]')).toHaveTextContent("Lesetext");
    expect(document.querySelector('[data-exam-annotation-region="reading_understanding:question:101"]')).toHaveTextContent("Lesefrage");
  });

  it("renders one question number for reading-understanding headings and pure question annotation text", async () => {
    const exercise = {
      exercise_base: { title: "Lesen 2", exam_type: "telc" },
      text_markdown: "Lesetext",
      questions: [{
        id: 101,
        question_number: 1,
        question_text: "Lesefrage",
        answer_options: [{ id: 1, option_key: "A", option_text: "Ja", is_correct: true }],
      }],
    };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(
      mockExamState("reading_understanding", exercise),
    ));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const heading = await screen.findByRole("heading", { name: "1. Lesefrage", level: 3 });
    expect(heading).toHaveTextContent(/^1\.\s+Lesefrage$/);
    expect(heading).not.toHaveTextContent("1. 1.");
    expect(screen.getByRole("radio")).toHaveAttribute("name", "Lesefrage");
    const region = document.querySelector('[data-exam-annotation-region="reading_understanding:question:101"]');
    expect(region).toHaveTextContent("Lesefrage");
    expect(region).not.toHaveTextContent("1.");
  });

  it("renders one question number for listening headings and pure question annotation text", async () => {
    const exercise = {
      exercise_base: { title: "Hören 1", exam_type: "telc" },
      questions: [{
        id: 201,
        question_number: 1,
        question_text: "Hörfrage",
        answer_options: [{ id: 1, option_key: "A", option_text: "Richtig", is_correct: true }],
      }],
    };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(
      mockExamState("listening_teil1", exercise, "listening"),
    ));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const heading = await screen.findByRole("heading", { name: "1. Hörfrage", level: 3 });
    expect(heading).toHaveTextContent(/^1\.\s+Hörfrage$/);
    expect(heading).not.toHaveTextContent("1. 1.");
    expect(screen.getByRole("radio")).toHaveAttribute("name", "Hörfrage");
    const region = document.querySelector('[data-exam-annotation-region="listening_teil1:question:201"]');
    expect(region).toHaveTextContent("Hörfrage");
    expect(region).not.toHaveTextContent("1.");
  });

  it("centers selected answers in regular Sprachbausteine slots", () => {
    const selectedAnswerRule = [...clozeStyleElement.sheet.cssRules]
      .find((rule) => rule.selectorText === ".cloze-drop-slot__chip");

    expect(selectedAnswerRule.style.textAlign).toBe("center");
  });

  it.each([
    [
      "Teil 1",
      "cloze_choice",
      {
        exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
        content_with_placeholders: "Ich {{blank_1}} heute.",
        blanks: [{
          id: 41,
          blank_key: "blank_1",
          blank_number: 1,
          options: [{ id: 41, option_key: "A", option_text: "lerne", is_correct: true }],
        }],
      },
      { "cloze_choice:41": "A" },
      ".cloze-choice-slot-trigger",
    ],
    [
      "Teil 2",
      "cloze_matching",
      {
        exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
        content_with_placeholders: "Wir {{blank_1}} heute.",
        options: [{ id: 51, option_key: "option_1", option_text: "lernen" }],
        blank_answers: [{
          id: 51,
          blank_key: "blank_1",
          blank_number: 1,
          correct_option: { option_key: "option_1", option_text: "lernen" },
        }],
      },
      { "cloze_matching:51": "option_1" },
      ".telc-mock-cloze-matching-slot__chip",
    ],
  ])("centers the selected answer in telc-mock-exam Sprachbausteine %s", async (_label, partKey, exercise, answers, selector) => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      ...mockExamState(partKey, exercise),
      answers,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: exercise.exercise_base.title });
    expect(getComputedStyle(container.querySelector(selector)).textAlign).toBe("center");
  });

  it("moves between reading and Sprachbausteine parts without entering Hören", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: continuousNumberingExam(),
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_title_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const previous = await screen.findByRole("button", { name: "上一部分" });
    const next = screen.getByRole("button", { name: "下一部分" });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(screen.getByRole("heading", { name: "3. Verstehen" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 2" }));
    expect(screen.getByRole("button", { name: "下一部分" })).toBeDisabled();
  });

  it("places large part arrows between the exercise and answer sheet", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: continuousNumberingExam(),
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_understanding",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const exercise = container.querySelector(".telc-mock-exam-paper");
    const navigation = await screen.findByRole("navigation", { name: "前后部分导航" });
    const answerSheet = screen.getByRole("region", { name: "答题卡" });
    const next = screen.getByRole("button", { name: "下一部分" });
    const arrowStyle = getComputedStyle(next);

    expect(exercise.compareDocumentPosition(navigation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(navigation.compareDocumentPosition(answerSheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(arrowStyle.width).toBe("4rem");
    expect(arrowStyle.minHeight).toBe("4rem");
    expect(arrowStyle.fontSize).toBe("1.8rem");
  });

  it("disables both part arrows while listening audio is playing", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: listeningRangeExam(),
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil2",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 2,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const previous = await screen.findByRole("button", { name: "上一部分" });
    const next = screen.getByRole("button", { name: "下一部分" });
    const audio = container.querySelector("audio");

    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();

    fireEvent.play(audio);
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();

    fireEvent.pause(audio);
    expect(previous).toBeEnabled();
    expect(next).toBeEnabled();
  });

  it("shows a read-only audio timeline with event-synced time", async () => {
    const exam = listeningRangeExam();
    exam.parts.listening_teil2.audio_file_url = "/teil2.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam,
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil2",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 2,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toBeInTheDocument();
      return element;
    });
    const progress = container.querySelector(".telc-mock-exam-audio-timeline progress");
    expect(progress).toBeInTheDocument();
    expect(audio).not.toHaveAttribute("controls");
    expect(container.querySelector(".telc-mock-exam-audio-timeline input")).toBeNull();

    Object.defineProperty(audio, "duration", { configurable: true, value: 125 });
    Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 65 });
    fireEvent.loadedMetadata(audio);
    fireEvent.timeUpdate(audio);

    expect(progress).toHaveAttribute("value", "65");
    expect(container.querySelector(".telc-mock-exam-audio-timeline")).toHaveStyle({ "--telc-audio-progress": "52%" });
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(screen.getByText("02:05")).toBeInTheDocument();

    fireEvent.loadStart(audio);
    expect(progress).toHaveAttribute("value", "0");
    expect(screen.getAllByText("00:00")).toHaveLength(2);
  });

  it("shows the existing spinner while audio playback is loading", async () => {
    let finishPlay;
    playSpy.mockImplementationOnce(() => new Promise((resolve) => { finishPlay = resolve; }));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam,
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const spinner = await waitFor(() => {
      const element = container.querySelector(".telc-mock-exam-audio-spinner");
      expect(element).toBeInTheDocument();
      return element;
    });
    expect(screen.getByText("正在加载听力音频…")).toBeInTheDocument();
    expect(spinner).toHaveClass("telc-mock-exam-audio-spinner");
    expect(mockExamStyleSource).toContain("animation: telc-mock-exam-audio-spin 0.8s linear infinite");

    fireEvent.canPlay(container.querySelector("audio"));
    await waitFor(() => expect(finishPlay).toEqual(expect.any(Function)));
    await act(async () => { finishPlay(); });
    await waitFor(() => expect(container.querySelector(".telc-mock-exam-audio-spinner")).toBeNull());
    expect(screen.getByText("正在播放 · Hören · Teil 1")).toBeInTheDocument();
  });

  it("shows and clears the spinner while audio buffers", async () => {
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam,
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toBeInTheDocument();
      return element;
    });
    await waitFor(() => expect(container.querySelector(".telc-mock-exam-audio-spinner")).toBeNull());

    fireEvent.waiting(audio);
    expect(container.querySelector(".telc-mock-exam-audio-spinner")).toBeInTheDocument();
    fireEvent.playing(audio);
    await waitFor(() => expect(container.querySelector(".telc-mock-exam-audio-spinner")).toBeNull());
  });

  it("keeps part arrows available when listening autoplay is rejected", async () => {
    playSpy.mockRejectedValue(new DOMException("autoplay blocked", "NotAllowedError"));
    const exam = listeningRangeExam();
    exam.parts.listening_teil2.audio_file_url = "/teil2.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam,
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil2",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 2,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "点击继续播放录音" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一部分" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一部分" })).toBeEnabled();
  });

  it("uses the reliable backup audio flow for TELC B2", async () => {
    let finishDownload;
    vi.stubGlobal("fetch", vi.fn((url) => url === "/b2-teil1.m4a"
      ? new Promise((resolve) => { finishDownload = resolve; })
      : Promise.resolve(successfulAudioResponse(url))));
    playSpy
      .mockRejectedValueOnce(new Error("stream failed"))
      .mockRejectedValueOnce(new Error("stream failed again"))
      .mockResolvedValue(undefined);
    const exam = listeningRangeExam();
    exam.exam_type = "TELC";
    exam.level = "B2";
    exam.parts.listening_teil1.audio_file_url = "/b2-teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B2:7", JSON.stringify({
      exam,
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}>
        <Routes>
          <Route path="/modules/exam-preparation/:examType/:level/mock-exam" element={<TelcMockExamPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    const audio = container.querySelector("audio");
    expect(audio).toHaveAttribute("src", "/b2-teil1.m4a");
    audio.currentTime = 23;
    fireEvent.canPlay(audio);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("正在切换备用音频…")).toBeInTheDocument();

    await act(async () => {
      finishDownload(successfulAudioResponse("/b2-teil1.m4a"));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(audio).toHaveAttribute("src", "blob:/b2-teil1.m4a");
    expect(audio.currentTime).toBe(23);
    expect(playSpy).toHaveBeenCalledTimes(3);
  });

  it("enables available part arrows after listening audio has finished", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: listeningRangeExam(),
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil2",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 5,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "上一部分" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一部分" })).toBeEnabled();
  });

  it("crosses from Sprachbausteine to Hören with arrows in the completed review", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: continuousNumberingExam(),
      phase: "results",
      deadline: 0,
      activePart: "cloze_matching",
      answers: {},
      writingText: "",
      writingAssessment: { topic_relevant: false },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "下一部分" }));
    expect(screen.getByRole("heading", { name: "7. Hörfrage" })).toBeInTheDocument();
  });

  it("does not show part arrows in Schreiben", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          writing: {
            exercise_base: { title: "Schreiben", exam_type: "telc" },
            request_text: "Schreiben Sie einen Brief.",
            task_text: "Antworten Sie auf die Aufgabe.",
          },
        },
      },
      phase: "writing",
      deadline: Date.now() + 60_000,
      activePart: "writing",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "提交写作并自评" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一部分" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一部分" })).not.toBeInTheDocument();
  });

  it("does not show part arrows for Schreiben in the completed review", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          writing: {
            exercise_base: { title: "Schreiben", exam_type: "telc" },
            request_text: "Schreiben Sie einen Brief.",
            task_text: "Antworten Sie auf die Aufgabe.",
          },
        },
      },
      phase: "results",
      deadline: 0,
      activePart: "writing",
      answers: {},
      writingText: "",
      writingAssessment: { topic_relevant: false },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "考试结果与答案回顾" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一部分" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一部分" })).not.toBeInTheDocument();
  });

  it("shows only reading rows in the answer sheet during the reading phase", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: answerSheetExam(),
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_understanding",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    const paper = container.querySelector(".telc-mock-exam-paper");
    expect(within(answerSheet).getByRole("heading", { name: "Lesen & Sprachbausteine" })).toBeInTheDocument();
    expect(within(answerSheet).queryByRole("heading", { name: "Hören" })).not.toBeInTheDocument();
    expect(paper.compareDocumentPosition(answerSheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll(".mock-answer-sheet")).toHaveLength(1);
  });

  it("continues question numbers across all reading and Sprachbausteine parts", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: continuousNumberingExam(),
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_title_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const paper = () => within(container.querySelector(".telc-mock-exam-paper"));

    expect(await paper().findByText("Text 1")).toBeInTheDocument();
    expect(paper().getByText("Text 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 2" }));
    expect(paper().getByRole("heading", { name: "3. Verstehen" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 3" }));
    expect(paper().getByRole("heading", { name: "4. Situation drei" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 1" }));
    expect(paper().getByRole("button", { name: "5" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 2" }));
    expect(paper().getByText("6")).toBeInTheDocument();
  });

  it("continues numbering from Sprachbausteine into Hören", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: continuousNumberingExam(),
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const paper = within(container.querySelector(".telc-mock-exam-paper"));

    expect(await paper.findByRole("heading", { name: "7. Hörfrage" })).toBeInTheDocument();
  });

  it("uses the global telc-mock-exam ranges in every listening introduction", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: listeningRangeExam(),
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 5,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const introduction = () => container.querySelector(".telc-mock-exam-introduction");

    expect(await screen.findByRole("heading", { name: "41. Hörfrage 1" })).toBeInTheDocument();
    expect(introduction()).toHaveTextContent("Aufgaben 41–45");
    expect(introduction()).not.toHaveTextContent("1 - 5");

    fireEvent.click(screen.getByRole("button", { name: "Hören · Teil 2" }));
    expect(introduction()).toHaveTextContent("Aufgaben 46–55");
    expect(introduction()).not.toHaveTextContent("6 - 15");

    fireEvent.click(screen.getByRole("button", { name: "Hören · Teil 3" }));
    expect(introduction()).toHaveTextContent("Aufgaben 56–60");
    expect(introduction()).not.toHaveTextContent("16 - 20");
  });

  it("renders the current listening part status with larger type", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: continuousNumberingExam(),
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const statusTitle = await screen.findByText("正在播放 · Hören · Teil 1");
    expect(statusTitle).toHaveClass("telc-mock-exam-audio-status__title");
    expect(getComputedStyle(statusTitle).fontSize).toBe("1.05rem");
  });

  it.each([
    [
      "reading_title_matching",
      {
        exercise_base: { title: "Lesen 1", exam_type: "telc" },
        instruction: "Eigene Einleitung für Lesen Teil 1.",
        options: [],
        items: [],
      },
      "reading",
      "Eigene Einleitung für Lesen Teil 1.",
    ],
    [
      "reading_understanding",
      {
        exercise_base: { title: "Lesen 2", exam_type: "telc" },
        text_markdown: "Lesetext",
        questions: [],
      },
      "reading",
      "Lesen Sie den Text und die Aufgaben. Welche Lösung (a, b oder c) ist jeweils richtig?",
    ],
    [
      "reading_ad_matching",
      {
        exercise_base: { title: "Lesen 3", exam_type: "telc" },
        instruction: "",
        ads: [],
        items: [],
      },
      "reading",
      "Lesen sie die Situationen 1-10 und die Anzeigen a-l. Finden sie für jede die passende Anzeige. Sie können jede Anzeige nur einmal benutzen. Markieren sie Ihre Lösungen für die Aufgaben 1–10 auf dem Antwortbogen. Wenn Sie zu einer Situation keine Anzeige finden, markieren Sie x.",
    ],
    [
      "cloze_choice",
      {
        exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
        content_with_placeholders: "Lückentext",
        blanks: [],
      },
      "reading",
      "Lesen Sie den Text und schließen Sie die Lücken. Welche Lösung ist jeweils richtig?",
    ],
    [
      "cloze_matching",
      {
        exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
        content_with_placeholders: "Lückentext",
        options: [],
        blank_answers: [],
      },
      "reading",
      "Lesen Sie den folgenden Text. Welcher Ausdruck passt am besten in die Lücken?",
    ],
    [
      "listening_teil1",
      {
        exercise_base: { title: "Hören 1", exam_type: "telc" },
        listening_type: "short_text_true_false_with_prep",
        questions: [],
      },
      "listening",
      "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1 - 5 richtig oder falsch sind. Lesen Sie jetzt die Aufgaben 1 - 5. Sie haben dazu 30 Sekunden Zeit.",
    ],
    [
      "listening_teil2",
      {
        exercise_base: { title: "Hören 2", exam_type: "telc" },
        listening_type: "short_text_true_false_once",
        questions: [],
      },
      "listening",
      "Sie hören nun ein Gespräch. Dazu sollen Sie 10 Aufgaben lösen. Sie hören das Gespräch zweimal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
    ],
    [
      "listening_teil3",
      {
        exercise_base: { title: "Hören 3", exam_type: "telc" },
        listening_type: "dialog_true_false_twice",
        questions: [],
      },
      "listening",
      "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
    ],
  ])("shows the matching Einleitung above %s", async (partKey, exercise, phase, expectedText) => {
    sessionStorage.setItem(
      "exam-preparation-written-mock-v1:TELC:B1:7",
      JSON.stringify(mockExamState(partKey, exercise, phase)),
    );

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const introductionText = await screen.findByText(expectedText);
    const introduction = introductionText.closest(".telc-mock-exam-introduction");
    const heading = container.querySelector(".telc-mock-exam-paper__heading");
    expect(screen.getByText("Einleitung")).toBeInTheDocument();
    expect(introduction).toBeInTheDocument();
    expect(heading.nextElementSibling).toBe(introduction);
  });

  it("keeps answer-sheet option geometry stable when an answer is selected", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: answerSheetExam(),
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_understanding",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    const option = within(answerSheet).getByRole("button", { name: "第 1 题，答案 A" });
    const marker = option.querySelector("i");
    const before = {
      width: getComputedStyle(option).width,
      height: getComputedStyle(option).height,
      fontWeight: getComputedStyle(option).fontWeight,
      markerBorderWidth: getComputedStyle(marker).borderTopWidth,
    };
    fireEvent.click(option);
    await waitFor(() => expect(option).toHaveClass("is-selected"));

    expect({
      width: getComputedStyle(option).width,
      height: getComputedStyle(option).height,
      fontWeight: getComputedStyle(option).fontWeight,
      markerBorderWidth: getComputedStyle(marker).borderTopWidth,
    }).toEqual(before);
  });

  it("shows only listening rows in the answer sheet during the listening phase", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: answerSheetExam(),
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    expect(within(answerSheet).getByRole("heading", { name: "Hören" })).toBeInTheDocument();
    expect(within(answerSheet).queryByRole("heading", { name: "Lesen & Sprachbausteine" })).not.toBeInTheDocument();
  });

  it("shows reading and listening rows together in the completed exam review", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: answerSheetExam(),
      phase: "results",
      deadline: 0,
      activePart: "reading_understanding",
      answers: {},
      writingText: "",
      writingAssessment: { topic_relevant: false },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    expect(within(answerSheet).getByRole("heading", { name: "Lesen & Sprachbausteine" })).toBeInTheDocument();
    expect(within(answerSheet).getByRole("heading", { name: "Hören" })).toBeInTheDocument();
  });

  it("uses the regular reading-ad carousel and one-question-at-a-time layout", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          reading_ad_matching: {
            exercise_base: { title: "Lesen 3", exam_type: "telc" },
            instruction: "Ordnen Sie zu.",
            ads: [
              { id: 1, ad_key: "A", ad_text_markdown: "Anzeige A" },
              { id: 2, ad_key: "B", ad_text_markdown: "Anzeige B" },
            ],
            items: [
              { id: 11, item_number: 1, item_text: "Situation eins", correct_ad: { ad_key: "A" } },
              { id: 12, item_number: 2, item_text: "Situation zwei", correct_ad: { ad_key: "B" } },
            ],
          },
        },
      },
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_ad_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByText("Situation eins")).toBeInTheDocument();
    expect(screen.queryByText("Situation zwei")).not.toBeInTheDocument();
    expect(container.querySelector(".reading-ad-carousel")).toBeInTheDocument();
    expect(container.querySelectorAll(".reading-ad-card")).toHaveLength(2);
  });

  it("hides question favorites in Lesen Teil 1 until answers are shown", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          reading_title_matching: {
            exercise_base: { title: "Lesen 1", exam_type: "telc" },
            options: [{ id: 1, option_key: "A", option_text: "Titel A" }],
            items: [{
              id: 11,
              item_number: 1,
              text: "Text eins",
              correct_option: { id: 1, option_key: "A", option_text: "Titel A" },
            }],
          },
        },
      },
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_title_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByText("Text eins")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏这道题" })).not.toBeInTheDocument();
  });

  it("shows each Lesen Teil 1 option letter before its title", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          reading_title_matching: {
            exercise_base: { title: "Lesen 1", exam_type: "telc" },
            options: [
              { id: 1, option_key: "A", option_text: "Erster Titel" },
              { id: 2, option_key: "B", option_text: "Zweiter Titel" },
            ],
            items: [{
              id: 11,
              item_number: 1,
              text: "Text eins",
              correct_option: { id: 1, option_key: "A", option_text: "Erster Titel" },
            }],
          },
        },
      },
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "reading_title_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "Überschrift auswählen" }));
    const firstOption = await screen.findByRole("button", { name: "A Erster Titel" });
    expect(screen.getByRole("button", { name: "B Zweiter Titel" })).toBeInTheDocument();
    fireEvent.click(firstOption);

    const selectedAnswer = screen.getByRole("button", { name: "A Erster Titel" });
    expect(within(selectedAnswer).getByText("A")).toHaveClass("reading-title-select__key");
    expect(within(selectedAnswer).getByText("Erster Titel")).toHaveClass("reading-title-select__label");
  });

  it("keeps the Sprachbausteine 2 option pool visible with compact text spacing", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          cloze_matching: {
            exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
            content_with_placeholders: "Ich {{blank_1}} heute.",
            options: [{ id: 1, option_key: "A", option_text: "lerne" }],
            blank_answers: [{ id: 2, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" } }],
          },
        },
      },
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "cloze_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const pool = await screen.findByRole("region", { name: "选项区" });
    const text = container.querySelector(".telc-mock-cloze-matching-text");
    expect(pool).toHaveClass("telc-mock-cloze-matching-pool--sticky");
    expect(text).toHaveClass("telc-mock-cloze-matching-text--compact");
  });

  it("hides question favorites in Sprachbausteine Teil 2 until answers are shown", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          cloze_matching: {
            exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
            content_with_placeholders: "Ich {{blank_1}} heute.",
            options: [{ id: 1, option_key: "A", option_text: "lerne" }],
            blank_answers: [{
              id: 2,
              blank_key: "blank_1",
              blank_number: 1,
              correct_option: { id: 1, option_key: "A", option_text: "lerne" },
            }],
          },
        },
      },
      phase: "reading",
      deadline: Date.now() + 60_000,
      activePart: "cloze_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    expect(await screen.findByRole("region", { name: "选项区" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏这道题" })).not.toBeInTheDocument();
  });

  it("keeps embedded mobile ad cards from competing with the sticky exam header", () => {
    expect(mockExamStyleSource).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.telc-mock-exam-page \.reading-ad-sticky-stack\s*\{[^}]*position:\s*static/
    );
  });

  it("limits the sticky Sprachbausteine option pool to the available viewport height", () => {
    expect(mockExamStyleSource).toMatch(
      /\.telc-mock-cloze-matching-pool\s*\{[^}]*max-height:\s*calc\(100dvh - [^)]+\)[^}]*overflow-y:\s*auto/
    );
  });

  it("scrolls the exam header away and sticks the option pool to the viewport top", () => {
    const { container } = render(
      <>
        <style>{`${appLayoutStyleSource}\n${mockExamStyleSource}`}</style>
        <div className="app-layout">
          <main className="telc-mock-exam-page">
            <header className="telc-mock-exam-header" />
            <section className="telc-mock-cloze-matching-pool" />
          </main>
        </div>
      </>
    );

    const layout = container.querySelector(".app-layout");
    const header = container.querySelector(".telc-mock-exam-header");
    const pool = container.querySelector(".telc-mock-cloze-matching-pool");

    expect(getComputedStyle(layout).overflowX).toBe("clip");
    expect(getComputedStyle(header).position).toBe("static");
    expect(getComputedStyle(pool).position).toBe("sticky");
    expect(getComputedStyle(pool).top).toBe("0px");
  });

  it("gates hover polish to pointer devices and provides press feedback", () => {
    expect(readingAdStyleSource).toContain("@media (hover: hover) and (pointer: fine)");
    expect(readingAdStyleSource).toMatch(/\.reading-ad-check-btn:active:not\(:disabled\)/);
    expect(readingAdStyleSource).toMatch(/\.reading-ad-carousel-controls__arrow:active:not\(:disabled\)/);
  });

  it("keeps the one-minute transition between Teil 1 and Teil 2", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          listening_teil1: { exercise_base: { title: "Teil 1" }, audio_file_url: "/teil1.m4a", questions: [] },
          listening_teil2: { exercise_base: { title: "Teil 2" }, audio_file_url: "/teil2.m4a", questions: [] },
        },
      },
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/teil1.m4a");
      return element;
    });

    fireEvent.ended(audio);

    expect(await screen.findByText("录音间隔")).toBeInTheDocument();
    expect(screen.getByText("接下来：Hören · Teil 2")).toBeInTheDocument();
  });

  it("plays the Teil 2 audio twice back-to-back before moving toward Teil 3", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          listening_teil1: { exercise_base: { title: "Teil 1" }, audio_file_url: "/teil1.m4a", questions: [] },
          listening_teil2: { exercise_base: { title: "Teil 2" }, audio_file_url: "/teil2.m4a", questions: [] },
          listening_teil3: { exercise_base: { title: "Teil 3" }, audio_file_url: "/teil3.m4a", questions: [] },
        },
      },
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil2",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 2,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/teil2.m4a");
      return element;
    });
    await waitFor(() => expect(screen.getByText("zweimal")).toBeInTheDocument());
    expect(screen.queryByText("第 2 / 2 遍")).not.toBeInTheDocument();

    fireEvent.ended(audio);

    await waitFor(() => expect(screen.getByText("zweimal")).toBeInTheDocument());
    expect(screen.queryByText("接下来：Hören · Teil 3")).not.toBeInTheDocument();

    fireEvent.ended(audio);

    expect(await screen.findByText("接下来：Hören · Teil 3")).toBeInTheDocument();
    expect(screen.queryByText(/第二遍/)).not.toBeInTheDocument();
  });

  it("plays TELC B2 Teil 2 once and starts a 30-second gap", async () => {
    const beepOscillator = {
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    };
    beepOscillator.stop.mockImplementation(() => queueMicrotask(() => beepOscillator.onended?.()));
    const closeAudioContext = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("AudioContext", class {
      constructor() {
        this.currentTime = 1;
        this.state = "running";
        this.destination = {};
      }

      createOscillator() {
        return beepOscillator;
      }

      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }

      close() {
        return closeAudioContext();
      }
    });
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B2:7", JSON.stringify({
      exam: {
        exam_type: "TELC",
        level: "B2",
        parts: {
          listening_teil2: { exercise_base: { title: "Teil 2" }, audio_file_url: "/b2-teil2.m4a", questions: [] },
          listening_teil3: { exercise_base: { title: "Teil 3" }, audio_file_url: "/b2-teil3.m4a", questions: [] },
        },
      },
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil2",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 2,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}>
        <Routes>
          <Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toHaveAttribute("src", "/b2-teil2.m4a");
      return element;
    });

    await waitFor(() => expect(screen.getByText("einmal")).toBeInTheDocument());
    expect(screen.getByText(
      "Sie hören nun ein Interview. Dazu sollen Sie 10 Aufgaben lösen. Sie hören das Gespräch nur einmal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
    )).toBeInTheDocument();
    const playCallsBeforeEnd = playSpy.mock.calls.length;
    fireEvent.ended(audio);

    await waitFor(() => expect(beepOscillator.start).toHaveBeenCalledOnce());
    expect(beepOscillator.stop).toHaveBeenCalledOnce();
    expect(closeAudioContext).toHaveBeenCalledOnce();
    expect(await screen.findByText("录音间隔")).toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledTimes(playCallsBeforeEnd);
    expect(screen.getByText("00:30")).toBeInTheDocument();
    expect(screen.getByText("接下来：Hören · Teil 3")).toBeInTheDocument();
  });

  it("labels the single Teil 3 audio-file playback as einmal", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          listening_teil3: { exercise_base: { title: "Teil 3" }, audio_file_url: "/teil3.m4a", questions: [] },
        },
      },
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil3",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 4,
      audioStepStartedAt: Date.now(),
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "/teil3.m4a"));
    await waitFor(() => expect(screen.getByText("einmal")).toBeInTheDocument());
  });
});

describe("mock exam answer review", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        parts: {
          reading_understanding: {
            exercise_base: { title: "阅读理解测试", exam_type: "telc" },
            text_markdown: "Lesetext",
            questions: [
              {
                id: 101,
                question_number: 1,
                question_text: "Welche Antwort ist richtig?",
                explanation: "这是未作答时仍应展示的解析。",
                explanation_scope: "question",
                answer_options: [
                  { id: 1001, option_key: "A", option_text: "错误选项", is_correct: false, explanation: "" },
                  { id: 1002, option_key: "B", option_text: "正确选项", is_correct: true, explanation: "" },
                ],
              },
            ],
          },
        },
      },
      phase: "results",
      deadline: 0,
      activePart: "reading_understanding",
      answers: {},
      writingText: "",
      writingAssessment: {
        topic_relevant: false,
        task_completion: "",
        communicative_design: "",
        formal_accuracy: "",
      },
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));
  });

  it("shows the correct answer and explanation for an unanswered question using the regular feedback card", async () => {
    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const feedback = await screen.findByText("未作答");
    const feedbackCard = feedback.closest(".reading-understanding-feedback");

    expect(feedbackCard).toHaveClass("reading-understanding-feedback--wrong");
    expect(feedbackCard).toHaveTextContent("Richtige Antwort: B - 正确选项");
    expect(feedbackCard).toHaveTextContent("Erklärung: 这是未作答时仍应展示的解析。");
    expect(container.querySelector(".telc-mock-exam-feedback")).not.toBeInTheDocument();
  });

  it("keeps a wrong selected option visible and renders option-level explanations", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.answers = { "reading_understanding:101": "A" };
    snapshot.exam.parts.reading_understanding.questions[0].explanation = "";
    snapshot.exam.parts.reading_understanding.questions[0].explanation_scope = "option";
    snapshot.exam.parts.reading_understanding.questions[0].answer_options[0].explanation = "A 选项的解析。";
    snapshot.exam.parts.reading_understanding.questions[0].answer_options[1].explanation = "B 选项的解析。";
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const feedback = await screen.findByText("Falsch");
    const feedbackCard = feedback.closest(".reading-understanding-feedback");
    expect(container.querySelector(".reading-understanding-option--wrong")).toBeInTheDocument();
    expect(container.querySelector(".reading-understanding-option--correct")).toBeInTheDocument();
    expect(feedbackCard).toHaveTextContent("A – 错误选项");
    expect(feedbackCard).toHaveTextContent("A 选项的解析。");
    expect(feedbackCard).toHaveTextContent("B 选项的解析。");
  });

  it("marks both the wrong selection and the correct answer in the review answer sheet", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.answers = { "reading_understanding:101": "A" };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const wrongBubble = await screen.findByRole("button", { name: "第 1 题，答案 A" });
    const correctBubble = screen.getByRole("button", { name: "第 1 题，答案 B" });
    expect(wrongBubble).toHaveClass("is-wrong");
    expect(correctBubble).toHaveClass("is-correct");
  });

  it("shows the regular title-matching feedback card and explanation when unanswered", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.activePart = "reading_title_matching";
    snapshot.exam.parts = {
      reading_title_matching: {
        exercise_base: { title: "标题匹配测试", exam_type: "telc" },
        options: [
          { id: 2001, option_key: "A", option_text: "第一个标题" },
          { id: 2002, option_key: "B", option_text: "正确标题" },
        ],
        items: [
          {
            id: 201,
            item_number: 1,
            text: "Text für die Aufgabe",
            correct_option: { id: 2002, option_key: "B", option_text: "正确标题" },
            explanation: "标题匹配解析。",
          },
        ],
      },
    };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const feedback = await screen.findByText("未作答");
    const feedbackCard = feedback.closest(".reading-title-feedback");
    expect(feedbackCard).toHaveClass("reading-title-feedback--wrong");
    expect(feedbackCard).toHaveTextContent("Richtige Antwort: B - 正确标题");
    expect(feedbackCard).toHaveTextContent("Erklärung: 标题匹配解析。");
    expect(feedbackCard).toContainElement(screen.getByRole("button", { name: "收藏这道题" }));
  });

  it("shows a cloze explanation for an unanswered Sprachbausteine blank", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.activePart = "cloze_choice";
    snapshot.exam.parts = {
      cloze_choice: {
        exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
        content_with_placeholders: "Ich {{blank_1}} heute.",
        blanks: [
          {
            id: 301,
            blank_key: "blank_1",
            blank_number: 1,
            explanation: "这里需要使用正确的动词形式。",
            explanation_scope: "question",
            options: [
              { id: 3001, option_key: "A", option_text: "lerne", is_correct: true, explanation: "" },
              { id: 3002, option_key: "B", option_text: "lernen", is_correct: false, explanation: "" },
            ],
          },
        ],
      },
    };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const explanation = await screen.findByText("这里需要使用正确的动词形式。");
    expect(explanation.closest(".cloze-choice-inline-explanation")).toBeInTheDocument();
    expect(explanation.closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("shows the cloze-matching explanation card for an unanswered blank", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B1:7"));
    snapshot.activePart = "cloze_matching";
    snapshot.exam.parts = {
      cloze_matching: {
        exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
        content_with_placeholders: "Ich {{blank_1}} heute.",
        options: [
          { id: 4001, option_key: "A", option_text: "lerne" },
          { id: 4002, option_key: "B", option_text: "lernen" },
        ],
        blank_answers: [
          {
            id: 401,
            blank_key: "blank_1",
            blank_number: 1,
            correct_option: { id: 4001, option_key: "A", option_text: "lerne" },
            explanation: "匹配空格的解析。",
          },
        ],
      },
    };
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const explanation = await screen.findByText("匹配空格的解析。");
    const feedbackCard = explanation.closest(".cloze-feedback-card");
    expect(feedbackCard).toBeInTheDocument();
    expect(explanation.closest("[data-exam-annotation-region]")).toBeNull();
    expect(feedbackCard).toContainElement(screen.getByRole("button", { name: "收藏这道题" }));
  });
});

describe("mock exam annotations", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
  });

  function saveState(exam, overrides = {}) {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      ...mockExamState("reading_understanding", exam.parts.reading_understanding, "reading"),
      exam,
      attemptId: 31,
      ...overrides,
    }));
  }

  it("persists a real selection in the attempt scope across part switches", async () => {
    const exam = {
      parts: {
        reading_understanding: {
          exercise_base: { title: "Lesen 2", exam_type: "telc" },
          text_markdown: "Passage for notes",
          questions: [],
        },
        cloze_choice: {
          exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
          content_with_placeholders: "Cloze source",
          blanks: [],
        },
      },
    };
    saveState(exam);
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    const passage = await screen.findByText("Passage for notes");
    selectText(passage, 0, 7);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(mockAnnotationScope(31))).regions["reading_understanding:passage"])
      .toEqual([{ start: 0, end: 7, highlight: true, underline: false }]);

    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 2" }));
    expect(document.querySelector('[data-exam-annotation-region="reading_understanding:passage"]')).toHaveTextContent("Passage for notes");
    expect(JSON.parse(sessionStorage.getItem(mockAnnotationScope(31))).regions["reading_understanding:passage"])
      .toHaveLength(1);
  });

  it("keeps in-memory annotations when session storage writes fail", async () => {
    const exam = {
      parts: {
        reading_understanding: {
          exercise_base: { title: "Lesen 2", exam_type: "telc" },
          text_markdown: "Storage independent passage",
          questions: [],
        },
        cloze_choice: {
          exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
          content_with_placeholders: "Other source",
          blanks: [],
        },
      },
    };
    saveState(exam);
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    const passage = await screen.findByText("Storage independent passage");
    selectText(passage, 0, 7);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 2" }));
    selectText(screen.getByText("Storage independent passage"), 0, 7);
    expect(await screen.findByRole("button", { name: "高亮" })).toHaveAttribute("aria-pressed", "true");
    setItem.mockRestore();
  });

  it("keeps region IDs unique, flat, and outside exam chrome", async () => {
    saveState({
      parts: {
        reading_understanding: {
          exercise_base: { title: "Lesen 2", exam_type: "telc" },
          text_markdown: "Passage",
          questions: [{ id: 1, question_number: 1, question_text: "Question", answer_options: [{ id: 2, option_key: "A", option_text: "Option", is_correct: true }], explanation: "Explanation" }],
        },
      },
    });
    const { container } = render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Lesen 2" });
    const regions = [...container.querySelectorAll("[data-exam-annotation-region]")];
    expect(new Set(regions.map((region) => region.dataset.examAnnotationRegion)).size).toBe(regions.length);
    regions.forEach((region) => expect(region.querySelector("[data-exam-annotation-region]")).toBeNull());
    expect(screen.getByRole("button", { name: "← 退出模拟" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "提前交卷" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getAllByRole("radio")[0].closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("does not duplicate a selected matching chip while its modal is open", async () => {
    saveState({
      parts: {
        reading_title_matching: {
          exercise_base: { title: "Lesen 1", exam_type: "telc" },
          options: [{ id: 2, option_key: "A", option_text: "Headline" }],
          items: [{ id: 1, item_number: 1, text: "Text", correct_option: { option_key: "A" } }],
        },
      },
    }, { activePart: "reading_title_matching" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Lesen 1" });
    const selector = screen.getByRole("button", { name: "Überschrift auswählen" });
    fireEvent.click(selector);
    expect(document.querySelectorAll('[data-exam-annotation-region="reading_title_matching:option:title:1:A"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /A Headline/ }));
    expect(document.querySelectorAll('[data-exam-annotation-region="reading_title_matching:option:title:1:A"]')).toHaveLength(1);
  });

  it("keeps cloze source text in a part flow and excludes both cloze option surfaces", async () => {
    const exam = {
      parts: {
        cloze_choice: {
          exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
          content_with_placeholders: "Vor {{blank 1}} nach {{blank2}}.",
          blanks: [
            { id: 1, blank_key: "blank_1", blank_number: 1, options: [{ option_key: "A", option_text: "eins", is_correct: true }] },
            { id: 2, blank_key: "blank_2", blank_number: 2, options: [{ option_key: "B", option_text: "zwei", is_correct: true }] },
          ],
        },
        cloze_matching: {
          exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
          content_with_placeholders: "Ich {{blank 1}}.",
          options: [{ id: 3, option_key: "A", option_text: "lerne" }],
          blank_answers: [{ id: 4, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" } }],
        },
      },
    };
    saveState(exam, { activePart: "cloze_choice" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    const choiceFlows = [...document.querySelectorAll('[data-exam-annotation-flow^="cloze_choice:"]')];
    expect(new Set(choiceFlows.map((node) => node.dataset.examAnnotationFlow))).toEqual(new Set(["cloze_choice:source:0"]));
    expect(choiceFlows.map((node) => node.dataset.examAnnotationRegion)).toEqual([
      "cloze_choice:source:0", "cloze_choice:source:2", "cloze_choice:source:4",
    ]);
    fireEvent.click(document.querySelector(".telc-mock-exam-inline-answer button"));
    expect(document.querySelector('[data-exam-annotation-region^="cloze_choice:option:"]')).toBeNull();
    expect(screen.getByRole("dialog").querySelector("[data-exam-annotation-region]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /eins/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 2" }));
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    expect(new Set([...document.querySelectorAll('[data-exam-annotation-flow^="cloze_matching:"]')]
      .map((node) => node.dataset.examAnnotationFlow))).toEqual(new Set(["cloze_matching:source:0"]));
    expect(document.querySelector('[data-exam-annotation-region^="cloze_matching:option:"]')).toBeNull();
  });

  it("splits a paired B2 cloze answer across repeated positions", async () => {
    saveState({
      parts: {
        cloze_choice: {
          exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
          content_with_placeholders: "{{blank 1}} in Nord- {{blank 1}} in Südeuropa",
          blanks: [{
            id: 1,
            blank_key: "blank_1",
            blank_number: 1,
            options: [{ option_key: "A", option_text: "sowohl … als auch", is_correct: true }],
          }],
        },
      },
    }, { activePart: "cloze_choice" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    const slots = [...document.querySelectorAll(".telc-mock-exam-inline-answer > button")];
    expect(slots).toHaveLength(2);
    fireEvent.click(slots[0]);
    fireEvent.click(screen.getByRole("button", { name: /sowohl … als auch/ }));
    expect(slots[0]).toHaveTextContent("sowohl");
    expect(slots[0]).not.toHaveTextContent("als auch");
    expect(slots[1]).toHaveTextContent("als auch");
    expect(slots[1]).not.toHaveTextContent("sowohl");
  });

  it("splits Mock cloze flows at paragraph and source-block boundaries", async () => {
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    const exam = {
      parts: {
        cloze_matching: {
          exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
          content_with_placeholders: "Erster {{blank_1}} Satz.\n\nZweiter {{blank_2}} Ende.<br/>Dritter {{blank_3}}?",
          options: [{ id: 1, option_key: "A", option_text: "lerne" }],
          blank_answers: [
            { id: 11, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" } },
            { id: 12, blank_key: "blank_2", blank_number: 2, correct_option: { option_key: "A" } },
            { id: 13, blank_key: "blank_3", blank_number: 3, correct_option: { option_key: "A" } },
          ],
        },
      },
    };
    saveState(exam, { activePart: "cloze_matching" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const roots = [...document.querySelectorAll('[data-exam-annotation-flow^="cloze_matching:"]')];
    const firstParagraph = roots.filter((root) => /Erster|Satz/.test(root.textContent));
    const secondParagraph = roots.filter((root) => /Zweiter|Ende/.test(root.textContent));
    const thirdParagraph = roots.filter((root) => /Dritter|\?/.test(root.textContent));
    expect(new Set(firstParagraph.map((root) => root.dataset.examAnnotationFlow)).size).toBe(1);
    expect(new Set(secondParagraph.map((root) => root.dataset.examAnnotationFlow)).size).toBe(1);
    expect(new Set(thirdParagraph.map((root) => root.dataset.examAnnotationFlow)).size).toBe(1);
    expect(new Set(roots.map((root) => root.dataset.examAnnotationFlow)).size).toBe(3);

    const start = firstParagraph[0];
    const end = secondParagraph[secondParagraph.length - 1];
    selectAcrossText(start, 0, end, end.textContent.length);
    expect(screen.queryByRole("button", { name: "高亮" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
  });

  it("persists Mock cloze-choice source marks through answer changes and part navigation", async () => {
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    const exam = {
      parts: {
        cloze_choice: {
          exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
          content_with_placeholders: "Vor {{blank_1}} nach {{blank_2}} Ende.",
          blanks: [
            {
              id: 21,
              blank_key: "blank_1",
              blank_number: 1,
              explanation: "Erklärung 1",
              options: [{ id: 211, option_key: "A", option_text: "eins", is_correct: true }, { id: 212, option_key: "B", option_text: "anders", is_correct: false }],
            },
            {
              id: 22,
              blank_key: "blank_2",
              blank_number: 2,
              explanation: "Erklärung 2",
              options: [{ id: 221, option_key: "B", option_text: "zwei", is_correct: true }],
            },
          ],
        },
        cloze_matching: {
          exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
          content_with_placeholders: "Ich {{blank_1}}.",
          options: [{ id: 3, option_key: "A", option_text: "lerne" }],
          blank_answers: [{ id: 4, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" } }],
        },
      },
    };
    saveState(exam, { activePart: "cloze_choice" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    const roots = [...document.querySelectorAll('[data-exam-annotation-flow="cloze_choice:source:0"]')];
    selectAcrossText(roots[0], 0, roots[roots.length - 1], roots[roots.length - 1].textContent.length);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    const scope = mockAnnotationScope(31);
    const marked = JSON.parse(sessionStorage.getItem(scope));
    expect(Object.keys(marked.regions).sort()).toEqual([
      "cloze_choice:source:0", "cloze_choice:source:2", "cloze_choice:source:4",
    ]);

    fireEvent.click(document.querySelector(".telc-mock-exam-inline-answer button"));
    expect(screen.getByRole("dialog").querySelector("[data-exam-annotation-region]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "einsA" }));
    expect(document.querySelector('[data-exam-annotation-region^="cloze_choice:option:"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /eins/ }));
    fireEvent.click(screen.getByRole("button", { name: "andersB" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions).toEqual(marked.regions);

    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 2" }));
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 1" }));
    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    expect(JSON.parse(sessionStorage.getItem(scope)).regions).toEqual(marked.regions);
    expect(new Set([...document.querySelectorAll('[data-exam-annotation-flow^="cloze_choice:"]')]
      .map((node) => node.dataset.examAnnotationFlow))).toEqual(new Set(["cloze_choice:source:0"]));
  });

  it("keeps Mock cloze-matching marks scoped through replacement and part navigation", async () => {
    const exam = {
      parts: {
        cloze_matching: {
          exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
          content_with_placeholders: "Vor {{blank_1}} nach {{blank_2}} Ende.",
          options: [
            { id: 31, option_key: "A", option_text: "eins" },
            { id: 32, option_key: "B", option_text: "anders" },
          ],
          blank_answers: [
            { id: 41, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" }, explanation: "解析 1" },
            { id: 42, blank_key: "blank_2", blank_number: 2, correct_option: { option_key: "B" }, explanation: "解析 2" },
          ],
        },
        cloze_choice: {
          exercise_base: { title: "Sprachbausteine 1", exam_type: "telc" },
          content_with_placeholders: "Ich {{blank_1}}.",
          blanks: [{ id: 51, blank_key: "blank_1", blank_number: 1, options: [{ option_key: "A", option_text: "lerne", is_correct: true }] }],
        },
      },
    };
    saveState(exam, { activePart: "cloze_matching" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const roots = [...document.querySelectorAll('[data-exam-annotation-flow="cloze_matching:source:0"]')];
    selectAcrossText(roots[0], 0, roots[roots.length - 1], roots[roots.length - 1].textContent.length);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    const scope = mockAnnotationScope(31);
    const marked = JSON.parse(sessionStorage.getItem(scope));
    expect(Object.keys(marked.regions).sort()).toEqual([
      "cloze_matching:source:0", "cloze_matching:source:2", "cloze_matching:source:4",
    ]);

    const firstSlot = document.querySelector('[data-telc-mock-cloze-blank="blank_1"]');
    fireEvent.click(screen.getByRole("button", { name: "eins" }));
    fireEvent.click(firstSlot);
    expect(firstSlot).toHaveTextContent("eins");
    fireEvent.click(screen.getByRole("button", { name: "anders" }));
    fireEvent.click(firstSlot);
    expect(firstSlot).toHaveTextContent("anders");
    expect(JSON.parse(sessionStorage.getItem(scope)).regions).toEqual(marked.regions);
    expect(document.querySelector('[data-exam-annotation-region^="cloze_matching:option:"]')).toBeNull();
    expect(document.querySelector('[data-exam-annotation-region^="cloze_matching:explanation:"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 1" }));
    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 2" }));
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    expect(JSON.parse(sessionStorage.getItem(scope)).regions).toEqual(marked.regions);
    expect(new Set([...document.querySelectorAll('[data-exam-annotation-flow^="cloze_matching:"]')]
      .map((node) => node.dataset.examAnnotationFlow))).toEqual(new Set(["cloze_matching:source:0"]));
  });

  it("drags the whole matching card without a handle before and after placement", async () => {
    saveState({
      parts: {
        cloze_matching: {
          exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
          content_with_placeholders: "Ich {{blank_1}}.",
          options: [{ id: 1, option_key: "A", option_text: "lerne" }],
          blank_answers: [{ id: 2, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" } }],
        },
      },
    }, { activePart: "cloze_matching" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const poolText = screen.getByRole("button", { name: "lerne" });
    const slot = document.querySelector(".telc-mock-cloze-matching-slot");
    const pool = document.querySelector(".telc-mock-cloze-matching-pool");
    const transferValues = {};
    const dataTransfer = {
      setData: vi.fn((type, value) => { transferValues[type] = value; }),
      getData: vi.fn((type) => transferValues[type] || ""),
    };
    const pointerDown = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" });
    poolText.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(poolText).toHaveAttribute("draggable", "true");
    expect(document.querySelector(".telc-mock-cloze-matching-pool__handle")).toBeNull();
    fireEvent.dragStart(poolText, { dataTransfer });
    fireEvent.dragOver(slot);
    fireEvent.drop(slot, { dataTransfer });
    await waitFor(() => expect(slot).toHaveTextContent("lerne"));
    const placedCard = slot.querySelector(".telc-mock-cloze-matching-slot__chip");
    expect(placedCard).toHaveAttribute("draggable", "true");
    expect(placedCard.querySelector(".telc-mock-cloze-matching-pool__handle")).toBeNull();
    fireEvent.dragStart(placedCard, { dataTransfer });
    fireEvent.dragOver(pool);
    fireEvent.drop(pool, { dataTransfer });
    await waitFor(() => expect(screen.getByRole("button", { name: "lerne" })).toBeInTheDocument());
  });

  it("moves a matching option through touch pointer events and clears the preview", async () => {
    saveState({
      parts: {
        cloze_matching: {
          exercise_base: { title: "Sprachbausteine 2", exam_type: "telc" },
          content_with_placeholders: "Ich {{blank_1}}.",
          options: [{ id: 1, option_key: "A", option_text: "lerne" }],
          blank_answers: [{ id: 2, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A" } }],
        },
      },
    }, { activePart: "cloze_matching" });
    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const option = screen.getByRole("button", { name: "lerne" });
    const slot = document.querySelector(".telc-mock-cloze-matching-slot");
    expect(document.querySelector(".telc-mock-cloze-matching-pool__handle")).toBeNull();
    fireEvent.pointerDown(option, { pointerType: "touch", pointerId: 1, clientX: 1, clientY: 1 });
    expect(document.querySelector(".telc-mock-cloze-matching-touch-preview")).toBeInTheDocument();
    fireEvent.pointerMove(option, { pointerType: "touch", pointerId: 1, clientX: 2, clientY: 2 });
    fireEvent.pointerUp(slot, { pointerType: "touch", pointerId: 1, clientX: 2, clientY: 2 });
    await waitFor(() => expect(slot).toHaveTextContent("lerne"));
    expect(document.querySelector(".telc-mock-cloze-matching-touch-preview")).not.toBeInTheDocument();
  });
});

describe("mock exam annotation scope acceptance", () => {
  const scopeValue = (marker) => JSON.stringify({
    version: 1,
    regions: { "reading_understanding:passage": [{ start: 0, end: 4, highlight: marker === "old" }] },
  });

  function writingExam() {
    return {
      parts: {
        reading_understanding: {
          exercise_base: { title: "Lesen 2", exam_type: "telc" },
          text_markdown: "Passage",
          questions: [],
        },
        writing: {
          exercise_base: { title: "Schreiben", exam_type: "telc" },
          request_text: "Writing request",
          task_text: "Writing task",
          example_texts: [{ example_text: "Example answer" }],
        },
      },
    };
  }

  function writingReviewState(overrides = {}) {
    return {
      ...mockExamState("writing", writingExam().parts.writing, "writing_review"),
      exam: writingExam(),
      activePart: "writing",
      attemptId: 31,
      writingText: "My answer",
      writingAssessment: {
        topic_relevant: false,
        task_completion: "",
        communicative_design: "",
        formal_accuracy: "",
      },
      ...overrides,
    };
  }

  function saveSnapshot(snapshot) {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify(snapshot));
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    createMockExam.mockReset();
    fetchSavedMockExam.mockReset();
    submitSavedMockExam.mockReset();
    updateSavedMockExam.mockReset();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
  });

  it("clears the attempt scope before a successful self-assessment submit and keeps the existing payload contract", async () => {
    saveSnapshot(writingReviewState());
    sessionStorage.setItem(mockAnnotationScope(31), scopeValue("old"));
    submitSavedMockExam.mockResolvedValueOnce({});
    fetchSavedMockExam.mockResolvedValueOnce({ is_completed: false });

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("radio", { name: /否/ }));
    fireEvent.click(await screen.findByRole("button", { name: "查看得分" }));

    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    await waitFor(() => expect(submitSavedMockExam).toHaveBeenCalled());
    const payload = submitSavedMockExam.mock.calls[0][1];
    expect(Object.keys(payload).sort()).toEqual([
      "answers", "is_favorite", "progress", "writing_assessment", "writing_text",
    ].sort());
    expect(payload).not.toHaveProperty("annotations");
  });

  it.each([
    ["submit rejection", { submit: new Error("submit") }],
    ["completed fetch rejection", { fetch: new Error("fetch") }],
  ])("clears the attempt scope when %s", async (_label, failures) => {
    saveSnapshot(writingReviewState());
    sessionStorage.setItem(mockAnnotationScope(31), scopeValue("old"));
    if (failures.submit) submitSavedMockExam.mockRejectedValueOnce(failures.submit);
    else submitSavedMockExam.mockResolvedValueOnce({});
    if (failures.fetch) fetchSavedMockExam.mockRejectedValueOnce(failures.fetch);
    else fetchSavedMockExam.mockResolvedValueOnce({ is_completed: false });

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("radio", { name: /否/ }));
    fireEvent.click(await screen.findByRole("button", { name: "查看得分" }));

    await waitFor(() => expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull());
    await waitFor(() => expect(submitSavedMockExam).toHaveBeenCalled());
    const payload = submitSavedMockExam.mock.calls[0][1];
    expect(payload).not.toHaveProperty("annotations");
    if (failures.fetch) await waitFor(() => expect(fetchSavedMockExam).toHaveBeenCalledWith(31));
  });

  it("clears the scope on confirmed early submission and sends no annotation field", async () => {
    saveSnapshot({
      ...mockExamState("reading_understanding", writingExam().parts.reading_understanding, "reading"),
      exam: writingExam(),
      attemptId: 31,
    });
    sessionStorage.setItem(mockAnnotationScope(31), scopeValue("old"));
    submitSavedMockExam.mockResolvedValueOnce({});
    fetchSavedMockExam.mockResolvedValueOnce({ is_completed: false });

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "提前交卷" }));

    await waitFor(() => expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull());
    await waitFor(() => expect(submitSavedMockExam).toHaveBeenCalled());
    const payload = submitSavedMockExam.mock.calls[0][1];
    expect(Object.keys(payload).sort()).toEqual([
      "answers", "is_favorite", "progress", "writing_assessment", "writing_text",
    ].sort());
    expect(payload).not.toHaveProperty("annotations");
  });

  it("clears the old and newly created scopes when starting another exam from results", async () => {
    saveSnapshot({
      ...writingReviewState({ phase: "results", deadline: 0, activePart: "reading_understanding" }),
    });
    sessionStorage.setItem(mockAnnotationScope(31), scopeValue("old"));
    sessionStorage.setItem(mockAnnotationScope(42), scopeValue("new"));
    createMockExam.mockResolvedValueOnce({
      attempt_id: 42,
      ...writingExam(),
      progress: {},
    });

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "再考一套" }));

    await waitFor(() => expect(createMockExam).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Lesen & Sprachbausteine" })).toBeInTheDocument());
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    expect(sessionStorage.getItem(mockAnnotationScope(42))).toBeNull();
  });

  it("creates and labels a B2 paper from the route and exits to its level home", async () => {
    createMockExam.mockResolvedValueOnce({
      attempt_id: 42,
      exam_type: "TELC",
      level: "B2",
      ...writingExam(),
      progress: {},
    });
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}><Routes>
      <Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<><TelcMockExamPage /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    await screen.findByRole("heading", { name: "Lesen & Sprachbausteine" });
    expect(createMockExam).toHaveBeenCalledWith(expect.any(String), { examType: "TELC", level: "B2", levelPath: "b2" });
    expect(screen.getByText("TELC B2 · 笔试模拟")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← 退出模拟" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/b2");
  });

  it("lets the persisted paper scope override a conflicting client route", async () => {
    fetchSavedMockExam.mockResolvedValueOnce({
      id: 77,
      exam_type: "TELC",
      level: "B1",
      exam: { ...writingExam(), exam_type: "TELC", level: "B1" },
      answers: {}, writing_text: "", writing_assessment: {}, is_favorite: false,
      progress: { phase: "reading", deadline: Date.now() + 60_000, active_part: "reading_understanding" },
    });
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam?attempt=77"]}><Routes>
      <Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<><TelcMockExamPage /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    await screen.findByRole("heading", { name: "Lesen & Sprachbausteine" });
    expect(screen.getByText("TELC B1 · 笔试模拟")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← 退出模拟" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/b1");
  });

  it("moves an auto-restored attempt pointer to its persisted level and prevents a cross-level restore", async () => {
    const b2Key = activeMockExamKey(7, { examType: "TELC", level: "B2" });
    const b1Key = activeMockExamKey(7, { examType: "TELC", level: "B1" });
    localStorage.setItem(b2Key, "77");
    fetchSavedMockExam.mockResolvedValueOnce({
      id: 77,
      exam_type: "TELC",
      level: "B1",
      exam: { ...writingExam(), exam_type: "TELC", level: "B1" },
      answers: {}, writing_text: "", writing_assessment: {}, is_favorite: false,
      progress: { phase: "reading", deadline: Date.now() + 60_000, active_part: "reading_understanding" },
    });

    const firstMount = render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}><Routes>
      <Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} />
    </Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Lesen & Sprachbausteine" });
    expect(localStorage.getItem(b2Key)).toBeNull();
    expect(localStorage.getItem(b1Key)).toBe("77");
    firstMount.unmount();

    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}><Routes>
      <Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(createMockExam).toHaveBeenCalled());
    expect(fetchSavedMockExam).toHaveBeenCalledTimes(1);
  });

  it("preserves annotations when resuming an unfinished attempt", async () => {
    const value = scopeValue("old");
    sessionStorage.setItem(mockAnnotationScope(77), value);
    fetchSavedMockExam.mockResolvedValueOnce({
      id: 77,
      exam: writingExam(),
      answers: {},
      writing_text: "",
      writing_assessment: {},
      is_favorite: false,
      progress: { phase: "reading", deadline: Date.now() + 60_000, active_part: "reading_understanding" },
    });

    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b1/mock-exam?attempt=77"]}><TelcMockExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Lesen 2" });

    expect(sessionStorage.getItem(mockAnnotationScope(77))).toBe(value);
  });

  it.each([
    ["saved", "/modules/exam-preparation/telc/b1/mock-exam?saved=88", { is_completed: true, id: 88 }],
    ["results", "/modules/exam-preparation/telc/b1/mock-exam", null],
  ])("keeps the pre-existing scope untouched in %s review", async (_label, route, savedMeta) => {
    const attemptId = savedMeta?.id || 31;
    const value = scopeValue("old");
    sessionStorage.setItem(mockAnnotationScope(attemptId), value);
    if (savedMeta) {
      fetchSavedMockExam.mockResolvedValueOnce({
        ...savedMeta,
        exam: writingExam(),
        answers: {}, writing_text: "", writing_assessment: {}, is_favorite: true,
        progress: { phase: "results" },
      });
    } else {
      saveSnapshot(writingReviewState({ phase: "results", deadline: 0, activePart: "reading_understanding" }));
    }

    render(<MemoryRouter initialEntries={[route]}><TelcMockExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "考试结果与答案回顾" });

    if (savedMeta) fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 2" }));
    const passage = document.querySelector('[data-exam-annotation-region="reading_understanding:passage"]');
    selectText(passage.querySelector("span") || passage, 0, 4);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));

    expect(sessionStorage.getItem(mockAnnotationScope(attemptId))).toBe(value);
  });

  it("autosaves only the existing progress fields", async () => {
    saveSnapshot({
      ...mockExamState("reading_understanding", writingExam().parts.reading_understanding, "reading"),
      exam: writingExam(),
      attemptId: 31,
    });
    updateSavedMockExam.mockResolvedValue({});

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    await waitFor(() => expect(updateSavedMockExam).toHaveBeenCalled(), { timeout: 1500 });
    const payload = updateSavedMockExam.mock.calls[0][1];
    expect(Object.keys(payload).sort()).toEqual([
      "answers", "is_favorite", "progress", "writing_assessment", "writing_text",
    ].sort());
    expect(payload).not.toHaveProperty("annotations");
  });

  it("suppresses a generated modal-option click after a real text selection, then allows the next click", async () => {
    saveSnapshot({
      ...mockExamState("reading_title_matching", {
        exercise_base: { title: "Lesen 1", exam_type: "telc" },
        options: [{ id: 2, option_key: "A", option_text: "Headline" }],
        items: [{ id: 1, item_number: 1, text: "Text", correct_option: { option_key: "A" } }],
      }, "reading"),
      attemptId: 31,
    });

    render(<MemoryRouter><TelcMockExamPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Überschrift auswählen" }));
    const option = await screen.findByRole("button", { name: "A Headline" });
    const optionRegion = document.querySelector('[data-exam-annotation-region="reading_title_matching:option:title:1:A"]');
    fireEvent.pointerDown(option, { pointerId: 1, pointerType: "mouse" });
    selectText(optionRegion, 0, 4);
    fireEvent.pointerUp(option, { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(option);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Überschrift auswählen" })).toBeInTheDocument();

    window.getSelection().removeAllRanges();
    fireEvent.pointerDown(option, { pointerId: 2, pointerType: "mouse" });
    fireEvent.pointerUp(option, { pointerId: 2, pointerType: "mouse" });
    fireEvent.click(option);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "AHeadline" })).toBeInTheDocument();
  });
});

describe("TELC B2 writing choice", () => {
  function writingOption(id, title, example) {
    return {
      id,
      exercise_base: { title, exam_type: "telc" },
      request_text: `Anleitung ${id}`,
      task_text: `Aufgabe ${id}`,
      example_texts: [{ example_text: example }],
    };
  }

  function b2Exam() {
    const first = writingOption(501, "Thema eins", "范文一");
    const second = writingOption(502, "Thema zwei", "范文二");
    return {
      exam_type: "TELC",
      level: "B2",
      selection: { writing: [501, 502] },
      parts: {
        writing_options: [first, second],
        writing: first,
      },
    };
  }

  function saveB2Snapshot(overrides = {}) {
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B2:7", JSON.stringify({
      exam: b2Exam(),
      phase: "writing",
      deadline: Date.now() + 30 * 60 * 1000,
      activePart: "writing",
      answers: {},
      writingText: "",
      writingChoiceId: null,
      writingAssessment: {},
      audioStep: 0,
      audioStepStartedAt: 0,
      attemptId: 31,
      isFavorite: false,
      wasEarlySubmitted: false,
      ...overrides,
    }));
  }

  function renderB2() {
    return render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}>
      <Routes><Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} /></Routes>
    </MemoryRouter>);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    updateSavedMockExam.mockResolvedValue({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows two B2 choices without a textarea and keeps the writing timer running", async () => {
    saveB2Snapshot();
    renderB2();

    await act(async () => { await Promise.resolve(); });
    expect(mockExamStyleSource).toContain(".telc-mock-exam-writing-choice-card { display: flex; flex-direction: column;");
    expect(mockExamStyleSource).toContain(".telc-mock-exam-writing-choice-card h3 { margin: 0 0 0.8rem;");
    expect(mockExamStyleSource).toContain(".telc-mock-exam-writing-choice-card h4 { margin: 0.8rem 0 0.25rem; color: #526b63; font-size: 0.95rem;");
    expect(mockExamStyleSource).toContain(".telc-mock-exam-writing-choice-card .telc-mock-exam-source-text { flex: 1;");
    expect(mockExamStyleSource).toContain(".telc-mock-exam-writing-chooser__options { grid-template-columns: 1fr; }");
    expect(screen.getAllByRole("button", { name: "Wählen" })).toHaveLength(2);
    expect(screen.getAllByRole("heading", { name: "Aushang" })).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Anleitung" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交写作并自评" })).not.toBeInTheDocument();
    expect(screen.getByText("30:00")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("29:59")).toBeInTheDocument();
  });

  it("treats an invalid persisted B2 choice as unselected and allows a valid choice", async () => {
    saveB2Snapshot({ writingChoiceId: 999 });
    renderB2();
    await act(async () => { await Promise.resolve(); });

    expect(screen.getAllByRole("button", { name: "Wählen" })).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Wählen" })[1]);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Aufgabe 502")).toBeInTheDocument();
  });

  it("locks the selected B2 choice, persists it locally, and autosaves its progress id", async () => {
    saveB2Snapshot();
    renderB2();

    await act(async () => { await Promise.resolve(); });
    const choices = screen.getAllByRole("button", { name: "Wählen" });
    fireEvent.click(choices[1]);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("Aufgabe 502")).toBeInTheDocument();
    expect(screen.queryByText("Aufgabe 501")).not.toBeInTheDocument();
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:TELC:B2:7"));
    expect(snapshot.writingChoiceId).toBe(502);
    expect(snapshot.exam.parts.writing.id).toBe(502);
    expect(screen.getByRole("heading", { name: "Aushang" }).closest(".writing-detail-request-panel"))
      .toHaveClass("writing-detail-request-panel--announcement");
    expect(screen.getByRole("heading", { name: "写作要求" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^(Anleitung|Aufgabe)$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox").closest(".writing-detail-input-card--long")).toBeInTheDocument();
    expect(document.querySelector(".telc-mock-exam-writing-grid")).not.toBeInTheDocument();
    expect(document.querySelector(".telc-mock-exam-writing-chooser")).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
    expect(updateSavedMockExam).toHaveBeenCalled();
    expect(updateSavedMockExam.mock.calls.at(-1)[1].progress.writing_choice_id).toBe(502);
  });

  it("restores the selected B2 exercise from backend progress and local snapshots", async () => {
    const exam = b2Exam();
    fetchSavedMockExam.mockResolvedValueOnce({ id: 41, exam, answers: {}, writing_text: "", writing_assessment: {}, is_favorite: false,
      progress: { phase: "writing_review", deadline: 0, active_part: "writing", writing_choice_id: 502 } });
    const backendMount = render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam?attempt=41"]}>
      <Routes><Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} /></Routes>
    </MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("范文二")).toBeInTheDocument();
    expect(screen.queryByText("范文一")).not.toBeInTheDocument();

    backendMount.unmount();
    localStorage.clear();
    sessionStorage.clear();
    saveB2Snapshot({ phase: "writing_review", deadline: 0, writingChoiceId: 502 });
    renderB2();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("范文二")).toBeInTheDocument();
    expect(screen.queryByText("范文一")).not.toBeInTheDocument();
  });

  it("completes an unselected writing review as an early zero-score submission", async () => {
    saveB2Snapshot({ phase: "writing_review", deadline: 0 });
    submitSavedMockExam.mockResolvedValueOnce({});
    fetchSavedMockExam.mockResolvedValueOnce({ is_completed: false });
    renderB2();
    await act(async () => { await Promise.resolve(); });

    const submit = screen.getByRole("button", { name: "查看得分" });
    expect(submit).toBeEnabled();
    await act(async () => { fireEvent.click(submit); await Promise.resolve(); });
    expect(submitSavedMockExam).toHaveBeenCalled();
    const payload = submitSavedMockExam.mock.calls[0][1];
    expect(payload.progress.early_submitted).toBe(true);
    expect(payload.progress.writing_choice_id).toBeNull();
  });

  it("shows a neutral writing result after early submission without a selected task", async () => {
    saveB2Snapshot({ phase: "results", deadline: 0, activePart: "writing", wasEarlySubmitted: true });
    renderB2();
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText("未选择写作题目")).toBeInTheDocument();
    expect(screen.queryByText("Aufgabe 501")).not.toBeInTheDocument();
    expect(screen.queryByText("Aufgabe 502")).not.toBeInTheDocument();
  });

  it("shows only the selected B2 writing task in results", async () => {
    saveB2Snapshot({ phase: "results", deadline: 0, activePart: "writing", writingChoiceId: 502 });
    renderB2();
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByText("Aufgabe 502")).toBeInTheDocument();
    expect(screen.queryByText("Aufgabe 501")).not.toBeInTheDocument();
  });

  it.each([
    ["B1", "exam-preparation-written-mock-v1:TELC:B1:7", { exam_type: "TELC", level: "B1", parts: { writing: writingOption(601, "B1", "B1范文") } }],
    ["legacy B2", "exam-preparation-written-mock-v1:TELC:B2:7", { exam_type: "TELC", level: "B2", parts: { writing: writingOption(602, "B2", "B2范文") } }],
  ])("keeps %s single-writing papers on the textarea flow", async (_label, key, exam) => {
    sessionStorage.setItem(key, JSON.stringify({ exam, phase: "writing", deadline: Date.now() + 1_800_000, activePart: "writing", answers: {}, writingText: "", writingAssessment: {}, audioStep: 0, audioStepStartedAt: 0, attemptId: null, isFavorite: false, wasEarlySubmitted: false }));
    const route = key.includes(":B2:") ? "b2" : "b1";
    render(<MemoryRouter initialEntries={[`/modules/exam-preparation/telc/${route}/mock-exam`]}>
      <Routes><Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} /></Routes>
    </MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Wählen" })).not.toBeInTheDocument();
    const isB2 = key.includes(":B2:");
    const requestHeading = screen.getByRole("heading", { name: isB2 ? "Aushang" : "E-Mail" });
    expect(requestHeading.closest(".writing-detail-request-panel")).toHaveClass(
      isB2 ? "writing-detail-request-panel--announcement" : "writing-detail-request-panel--email",
    );
    const requestBody = requestHeading.closest(".writing-detail-request-panel")
      .querySelector(`[data-exam-annotation-region="writing:request"]`);
    expect(requestBody).toHaveClass("writing-detail-request-panel__body");
    expect(writingDetailStyleSource).toContain(".writing-detail-request-panel--email .writing-detail-request-panel__body {");
    expect(requestHeading.closest(".telc-mock-exam-paper")).toHaveClass("telc-mock-exam-paper--writing");
    expect(mockExamStyleSource).toContain(".telc-mock-exam-paper--writing { width: 100%; margin-right: auto; margin-left: auto; padding: 0; border: 0; background: transparent; box-shadow: none; }");
    expect(screen.queryByRole("heading", { name: /^(Anleitung|Aufgabe)$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox").closest(".writing-detail-input-card--long"))[
      isB2 ? "toBeInTheDocument" : "toBeNull"
    ]();
  });
});

describe("TELC C1 mock exam", () => {
  const sessionKey = "exam-preparation-written-mock-v1:TELC:C1:7";
  const exam = {
    exam_type: "TELC",
    level: "C1",
    parts: {
      cloze_matching: {
        exercise_base: { title: "C1 Lesen 1", exam_type: "TELC", exercise_type: "CLOZE_MATCHING" },
        content_with_placeholders: "{{blank_0}} {{blank_1}}.",
        options: [{ id: 1, option_key: "beispiel", option_text: "Das vollständige Beispielsatzende." }, { id: 2, option_key: "A", option_text: "genau hier" }],
        blank_answers: [
          { id: 10, blank_key: "blank_0", blank_number: 0, correct_option: { option_key: "beispiel", option_text: "Das vollständige Beispielsatzende." } },
          { id: 11, blank_key: "blank_1", blank_number: 1, correct_option: { option_key: "A", option_text: "genau hier" } },
        ],
      },
      reading_ad_matching: {
        exercise_base: { title: "C1 Lesen 3", exam_type: "TELC" },
        ads: ["A", "B", "C", "D", "E"].map((ad_key, index) => ({ id: index + 1, ad_key, ad_text_markdown: `Absatz ${ad_key}` })),
        items: [
          { id: 21, item_number: 1, item_text: "Welche Anzeige passt?", correct_ad: { ad_key: "B" } },
          { id: 22, item_number: 2, item_text: "Welche Anzeige passt auch?", correct_ad: { ad_key: "A" } },
        ],
      },
      reading_understanding: {
        exercise_base: { title: "C1 Lesen 2", exam_type: "TELC" }, text_markdown: "Lesetext",
        questions: [{ id: 31, question_number: 1, question_text: "Aussage", answer_options: [
          { id: 1, option_key: "a", option_text: "Richtig", is_correct: true },
          { id: 2, option_key: "b", option_text: "Falsch" },
          { id: 3, option_key: "c", option_text: "Nicht im Text" },
        ] }],
      },
      cloze_choice: { exercise_base: { title: "C1 Sprachbausteine 1", exam_type: "TELC" }, content_with_placeholders: "Ich {{blank_1}}.", blanks: [] },
      listening_teil1: { exercise_base: { title: "C1 Hören 1", exam_type: "TELC" }, script: "Moderator: Testtranskript", content: { format: "speaker_matching", statements: [
        { statement_number: 1, statement: "Aussage eins", speaker: "Sprecher/in 1" },
        { statement_number: 2, statement: "Aussage zwei", speaker: "Sprecher/in 2" },
        ...Array.from({ length: 8 }, (_, index) => ({ statement_number: index + 3, statement: `Distraktor ${index + 3}`, speaker: "" })),
      ] }, questions: [
        { id: 701, question_number: 1, question_key: "statement_1", question_text: "Aussage eins", explanation: "Diese Aussage passt zu Sprecher/in 1.", answer_options: [{ id: 1, option_key: "A", option_text: "Sprecher/in 1", is_correct: true }, { id: 2, option_key: "B", option_text: "Sprecher/in 2", is_correct: false }] },
        { id: 702, question_number: 2, question_key: "statement_2", question_text: "Aussage zwei", answer_options: [{ id: 3, option_key: "A", option_text: "Sprecher/in 1", is_correct: false }, { id: 4, option_key: "B", option_text: "Sprecher/in 2", is_correct: true }] },
      ] },
      listening_teil2: { exercise_base: { title: "C1 Hören 2", exam_type: "TELC" }, content: { format: "multiple_choice" }, questions: [
        { id: 751, question_number: 1, question_key: "1", question_text: "Welche Aussage stimmt?", answer_options: [{ id: 7511, option_key: "A", option_text: "Antwort A", is_correct: true }, { id: 7512, option_key: "B", option_text: "Antwort B", is_correct: false }] },
      ] },
      listening_teil3: { exercise_base: { title: "C1 Hören 3", exam_type: "TELC" }, content: { format: "presentation_notes", slides: [{ number: "1", text: "<central><bold>Vortrag über Lernen</bold></central><br>{{blank_01}}", answers: [{ blank_id: "blank_01", answer: "Lernen" }] }] }, questions: [{ id: 801, question_number: 1, question_key: "blank_01", question_type: "text_input", question_text: "Lücke blank_01", correct_answer: "Lernen" }] },
      writing: {
        id: 90, exercise_base: { title: "C1 Schreiben", exam_type: "TELC" }, request_text: "Thema", task_text: "Schreiben Sie einen Text.", words_limit: 350,
        content: { quotes: [{ text: "Ein deutsches Zitat.", translation_zh: "中文引语翻译" }, { text: "Noch ein Zitat.", translation_zh: "第二条中文翻译" }], vocabulary_pages: [{ title: "Wörter", entries: [{ word: "der Beitrag", translation_zh: "贡献" }] }] },
      },
    },
  };

  function renderC1(phase = "reading", activePart = "cloze_matching", examValue = exam, answers = {}) {
    sessionStorage.setItem(sessionKey, JSON.stringify({
      exam: examValue, phase, deadline: Date.now() + 60_000, activePart, answers, writingText: "",
      writingAssessment: {}, audioStep: phase === "listening" ? 6 : 0, audioStepStartedAt: 0, attemptId: null,
      isFavorite: false, wasEarlySubmitted: false,
    }));
    return render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/c1/mock-exam"]}>
      <Routes><Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} /></Routes>
    </MemoryRouter>);
  }

  it("uses the practice flow for C1 Lesen Teil 1 and saves both answer keys", async () => {
    const { container } = renderC1();
    await screen.findByText("C1 Lesen 1");
    expect(container.querySelector(".telc-c1-cloze-matching")).toBeInTheDocument();
    const exampleGuide = screen.getByText("将 Beispiel 拖到标有 0 的空格中");
    const exampleOption = screen.getByRole("button", { name: "选择“Das vollständige Beispielsatzende.”并填入当前空格" });
    expect(exampleGuide.closest(".telc-c1-cloze-matching__example-option")).toContainElement(exampleOption);
    expect(container.querySelector('[data-telc-mock-cloze-blank="blank_0"]')).toHaveTextContent("0");
    expect(container.querySelector('[data-telc-mock-cloze-blank="blank_1"]')).not.toHaveClass("is-guided");
    const options = container.querySelectorAll(".telc-c1-cloze-matching .telc-mock-cloze-matching-pool__option");
    expect(options).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /genau hier/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 0 题，答案 beispiel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "第 0 题，答案 A" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "第 1 题，答案 beispiel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 1 题，答案 A" })).toBeInTheDocument();

    fireEvent.click(exampleOption);
    const filledExample = container.querySelector('[data-telc-mock-cloze-blank="blank_0"]');
    expect(filledExample).toHaveTextContent("Das vollständige Beispielsatzende.");
    expect(filledExample).toHaveClass("is-inline-selected");
    expect(screen.queryByText("将 Beispiel 拖到标有 0 的空格中")).not.toBeInTheDocument();
    expect(container.querySelector('[data-telc-mock-cloze-blank="blank_1"]')).toHaveClass("is-guided");
    fireEvent.click(screen.getByRole("button", { name: "选择“genau hier”并填入当前空格" }));
    expect(container.querySelector('[data-telc-mock-cloze-blank="blank_1"]')).not.toHaveClass("is-guided");
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(sessionKey)).answers).toEqual({
      "cloze_matching:10": "beispiel",
      "cloze_matching:11": "A",
    }));
  });

  it("wraps long C1 matching options and filled answers within their containers", () => {
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(18rem,\s*0\.85fr\)/s);
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching\s*>\s*\.telc-mock-cloze-matching-text\s*\{[^}]*grid-column:\s*1/s);
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching\s*>\s*\.telc-mock-cloze-matching-pool\s*\{[^}]*grid-column:\s*2/s);
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching \.telc-mock-cloze-matching-pool__option\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching \.telc-mock-cloze-matching-slot__chip\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching \.telc-mock-cloze-matching-pool__options\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching \.telc-mock-cloze-matching-slot\.is-inline-selected\s*\{[^}]*background:\s*transparent/s);
  });

  it("gives the C1 Lesen Teil 1 option panel room for its initial guide", () => {
    expect(mockExamStyleSource).toMatch(/\.telc-c1-cloze-matching\s*>\s*\.telc-mock-cloze-matching-pool\s*\{[^}]*min-height:\s*14rem/s);
    expect(mockExamStyleSource).toMatch(/@media\s*\(max-width:\s*1100px\)[\s\S]*?\.telc-c1-cloze-matching\s*>\s*\.telc-mock-cloze-matching-pool\s*\{[^}]*min-height:\s*0/s);
  });

  it("maps C1 Lesen Teil 2 to reading comprehension and Teil 3 to reusable A–E matching", async () => {
    const { container } = renderC1();
    expect(await screen.findByRole("heading", { level: 1, name: "Lesen & Sprachbausteine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lesen · Teil 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lesen · Teil 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lesen · Teil 3" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 2" }));
    expect(await screen.findByText("Lesetext")).toBeInTheDocument();
    expect(screen.getByText("Aussage")).toBeInTheDocument();
    const readingWorkspace = container.querySelector(".telc-c1-reading-understanding");
    expect(readingWorkspace).toBeInTheDocument();
    expect(readingWorkspace.querySelector(".telc-c1-reading-understanding__text")).toContainElement(screen.getByText("Lesetext"));
    expect(readingWorkspace.querySelector(".telc-c1-reading-understanding__questions")).toContainElement(screen.getByText("Aussage").closest(".reading-understanding-question-card"));
    expect(mockExamStyleSource).toMatch(/\.telc-c1-reading-understanding\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(18rem,\s*\.85fr\)/s);
    expect(screen.queryByText("Welche Anzeige passt?")).not.toBeInTheDocument();
    expect(mockExamStyleSource).toMatch(/\.telc-mock-exam-page\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s);

    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 3" }));
    expect(await screen.findByText("Welche Anzeige passt?")).toBeInTheDocument();
    const workspace = container.querySelector(".reading-ad-workspace");
    expect(workspace).toHaveClass("reading-ad-workspace--c1");
    const adControls = workspace.querySelector(".reading-ad-carousel-controls");
    const questionPagination = workspace.querySelector(".reading-ad-pagination");
    expect(adControls).not.toBeInTheDocument();
    expect(questionPagination).toBeInTheDocument();
    expect(container.querySelectorAll(".reading-ad-question-card")).toHaveLength(1);
    expect(container.querySelectorAll(".reading-ad-card")).toHaveLength(5);
    expect(screen.getByRole("heading", { name: "Lesetext" })).toBeInTheDocument();
    expect(container.querySelector("[aria-label='Abschnitt A']")).toBeInTheDocument();
    expect(container.querySelectorAll(".reading-ad-option")).toHaveLength(5);
    fireEvent.click(container.querySelector('.reading-ad-question-card input[value="A"]'));
    fireEvent.click(container.querySelectorAll(".reading-ad-pagination__item")[1]);
    expect(container.querySelector('.reading-ad-question-card input[type="radio"]:checked')).toBeNull();
    expect(screen.getByRole("button", { name: "完成本部分，进入听力" })).toBeInTheDocument();
    fireEvent.click(container.querySelector('.reading-ad-question-card input[value="A"]'));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(sessionKey)).answers).toMatchObject({
      "reading_ad_matching:21": "A",
      "reading_ad_matching:22": "A",
    }));
    expect(screen.getByRole("button", { name: "完成本部分，进入听力" })).toBeInTheDocument();
  });

  it("keeps legacy C1 reading_teil2 and reading_teil3 payloads mapped to the corrected UI order", async () => {
    const legacyExam = structuredClone(exam);
    legacyExam.parts.reading_teil2 = {
      ...legacyExam.parts.reading_ad_matching,
      exercise_base: {
        ...legacyExam.parts.reading_ad_matching.exercise_base,
        exercise_type: "READING_AD_MATCHING",
      },
    };
    legacyExam.parts.reading_teil3 = {
      ...legacyExam.parts.reading_understanding,
      exercise_base: {
        ...legacyExam.parts.reading_understanding.exercise_base,
        exercise_type: "READING_UNDERSTANDING",
      },
    };
    delete legacyExam.parts.reading_ad_matching;
    delete legacyExam.parts.reading_understanding;

    renderC1("reading", "cloze_matching", legacyExam);
    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 2" }));
    expect(await screen.findByText("Lesetext")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lesen · Teil 3" }));
    expect(await screen.findByText("Welche Anzeige passt?")).toBeInTheDocument();
  });

  it("renders speaker matching and presentation notes from their C1 content formats", async () => {
    renderC1("listening", "listening_teil1");
    const speaker1 = await screen.findByRole("combobox", { name: "Sprecher/-in 1" });
    expect(screen.getByText(/wählen Sie für jede Sprecherin bzw\. jeden Sprecher die passende Aussage a–j aus/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aufgaben" })).toBeInTheDocument();
    const part1Card = screen.getByRole("heading", { name: "Sprecher/-in 1" }).closest(".listening-exercise-c1-speaker-row");
    expect(part1Card.querySelector(".listening-exercise-c1-speaker-row__number")).toHaveTextContent("47");
    expect(screen.queryByText("Moderator: Testtranskript")).not.toBeInTheDocument();
    expect(screen.queryByText("Diese Aussage passt zu Sprecher/in 1.")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "观点选项" })).not.toBeInTheDocument();
    expect(screen.queryByText("选择对应观点")).not.toBeInTheDocument();
    expect(within(speaker1).getByRole("option", { name: "a. Aussage eins" })).toBeInTheDocument();
    fireEvent.change(speaker1, { target: { value: "a" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sprecher/-in 2" }), { target: { value: "b" } });
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(sessionKey)).answers).toEqual({
      "listening_teil1:701": "a",
      "listening_teil1:702": "b",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Hören · Teil 2" }));
    expect(await screen.findByText("Welche Aussage stimmt?")).toBeInTheDocument();
    expect(screen.getByText(/wählen Sie für jede Frage die passende Antwort/i)).toBeInTheDocument();
    expect(screen.getByText("Welche Aussage stimmt?").closest(".listening-exercise-question-card"))
      .not.toHaveClass("telc-mock-exam-choice-field");

    fireEvent.click(screen.getByRole("button", { name: "Hören · Teil 3" }));
    expect(screen.getByText(/ergänzen Sie die fehlenden Angaben in den Folien/i)).toBeInTheDocument();
    expect(await screen.findAllByText("Vortrag über Lernen")).toHaveLength(1);
    const title = screen.getByText("Vortrag über Lernen");
    expect(title.tagName).toBe("STRONG");
    expect(title.closest(".presentation-notes-content__center")).toBeInTheDocument();
    const slide = title.closest(".listening-exercise-question-card");
    expect(slide).toHaveClass("listening-exercise-c1-slide");
    expect(slide.closest(".listening-exercise-questions")).toHaveClass("listening-exercise-questions--presentation");
    expect(screen.getByRole("heading", { name: "Präsentation" })).toBeInTheDocument();
    expect(within(slide).getByRole("heading", { name: "Folie 1" })).toBeInTheDocument();
    expect(screen.queryByText(/blank_01/i)).not.toBeInTheDocument();
    const note = screen.getByRole("textbox", { name: "Aufgabe 65" });
    expect(within(screen.getByRole("region", { name: "答题卡" })).getByText("65")).toBeInTheDocument();
    fireEvent.change(note, { target: { value: "Lernen" } });
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem(sessionKey)).answers).toMatchObject({
      "listening_teil3:801": "Lernen",
    }));
  });

  it("reviews C1 speaker questions with the selected statement answer", async () => {
    renderC1("results", "listening_teil1", exam, {
      "listening_teil1:701": "b",
      "listening_teil1:702": "b",
    });

    const speaker1 = await screen.findByRole("combobox", { name: "Sprecher/-in 1" });
    expect(within(speaker1).getByRole("option", { name: "a. Aussage eins" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sprecher/-in 1" })).toBeInTheDocument();
    expect(speaker1).toBeDisabled();
    expect(speaker1).toHaveValue("b");
    expect(screen.getAllByText("Falsch").length).toBeGreaterThan(0);
    expect(screen.getByText("Moderator: Testtranskript")).toBeInTheDocument();
    expect(screen.getByText("Diese Aussage passt zu Sprecher/in 1.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /收藏题目/ })).not.toBeInTheDocument();
  });

  it("numbers all ten C1 presentation gaps from 65 through 74", async () => {
    const examWithTenNotes = structuredClone(exam);
    const blanks = Array.from({ length: 10 }, (_, index) => `blank_${String(index + 1).padStart(2, "0")}`);
    examWithTenNotes.parts.listening_teil3.content.slides = [{
      number: "1",
      text: blanks.map((blank) => `{{${blank}}}`).join("<br>"),
      answers: blanks.map((blank, index) => ({ blank_id: blank, answer: `Antwort ${index + 1}` })),
    }];
    examWithTenNotes.parts.listening_teil3.questions = blanks.map((blank, index) => ({
      id: 900 + index,
      question_number: index + 1,
      question_key: blank,
      question_type: "text_input",
      question_text: `Lücke ${index + 1}`,
      correct_answer: `Antwort ${index + 1}`,
    }));

    renderC1("listening", "listening_teil3", examWithTenNotes);

    expect(await screen.findByRole("textbox", { name: "Aufgabe 65" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Aufgabe 74" })).toBeInTheDocument();
    const answerSheet = within(screen.getByRole("region", { name: "答题卡" }));
    expect(answerSheet.getByText("65")).toBeInTheDocument();
    expect(answerSheet.getByText("74")).toBeInTheDocument();
    expect(screen.queryByText(/blank_\d+/i)).not.toBeInTheDocument();
  });

  it("appends declared presentation gaps that are missing from the slide text", async () => {
    const examWithMissingPlaceholder = structuredClone(exam);
    examWithMissingPlaceholder.parts.listening_teil3.content.slides = [{
      number: "1",
      text: "{{blank_01}}",
      answers: [
        { blank_id: "blank_01", answer: "Antwort 1" },
        { blank_id: "blank_02", answer: "Antwort 2" },
      ],
    }];
    examWithMissingPlaceholder.parts.listening_teil3.questions = [
      { id: 901, question_number: 1, question_key: "blank_01", question_type: "text_input", correct_answer: "Antwort 1" },
      { id: 902, question_number: 2, question_key: "blank_02", question_type: "text_input", correct_answer: "Antwort 2" },
    ];

    renderC1("listening", "listening_teil3", examWithMissingPlaceholder);

    expect(await screen.findByRole("textbox", { name: "Aufgabe 65" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Aufgabe 66" })).toBeInTheDocument();
    expect(screen.queryByText(/blank_0[12]/i)).not.toBeInTheDocument();
  });

  it("scores C1 presentation notes with the shared free-text rules and shows the multi-part hint", async () => {
    const examWithNotes = structuredClone(exam);
    examWithNotes.parts.listening_teil3.content.slides[0].text = "<central><bold>Notizen</bold></central><br>{{blank_01}}<br>{{blank_02}}<br>{{blank_03}}";
    examWithNotes.parts.listening_teil3.content.slides[0].answers = [
      { blank_id: "blank_01", answer: "Bücher werden weiter(hin) <or> (immer) noch" },
      { blank_id: "blank_02", answer: "doppelsinnig;lustig" },
      { blank_id: "blank_03", answer: "Lernen" },
    ];
    examWithNotes.parts.listening_teil3.questions = [
      { id: 811, question_number: 1, question_key: "blank_01", question_type: "text_input", question_text: "Lücke 1", correct_answer: "Bücher werden weiter(hin) <or> (immer) noch" },
      { id: 812, question_number: 2, question_key: "blank_02", question_type: "text_input", question_text: "Lücke 2", correct_answer: "doppelsinnig;lustig" },
      { id: 813, question_number: 3, question_key: "blank_03", question_type: "text_input", question_text: "Lücke 3", correct_answer: "Lernen" },
    ];
    renderC1("results", "listening_teil3", examWithNotes, {
      "listening_teil3:811": "immer noch",
      "listening_teil3:812": "doppelsinnig",
      "listening_teil3:813": "lernen",
    });

    const firstAnswer = await screen.findByDisplayValue("immer noch");
    expect(firstAnswer).toHaveAccessibleName("Aufgabe 65");
    expect(screen.getByDisplayValue("doppelsinnig")).toHaveAccessibleName("Aufgabe 66");
    expect(screen.getByDisplayValue("lernen")).toHaveAccessibleName("Aufgabe 67");
    expect(screen.queryByText(/blank_0[1-3]/i)).not.toBeInTheDocument();
    expect(screen.getByText("多个答案请用分号分隔")).toBeInTheDocument();
    expect(firstAnswer.closest("label")).toHaveClass("is-correct");
    expect(screen.getByDisplayValue("doppelsinnig").closest("label")).toHaveClass("is-wrong");
    expect(screen.getByText("2 / 28 题")).toBeInTheDocument();
    expect(screen.getByText("Richtige Antwort: Bücher werden weiter(hin) <or> (immer) noch")).toBeInTheDocument();
  });

  it("hides C1 translations and vocabulary while writing", async () => {
    renderC1("writing", "writing");
    expect(await screen.findByText("Ein deutsches Zitat.")).toBeInTheDocument();
    expect(screen.queryByText("中文引语翻译")).not.toBeInTheDocument();
    expect(screen.queryByText("第二条中文翻译")).not.toBeInTheDocument();
    expect(screen.queryByText("贡献")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "词汇表" })).not.toBeInTheDocument();
    expect(screen.getByText("至少 350 词")).toBeInTheDocument();
  });

  it("lets C1 writing results toggle quote and vocabulary translations", async () => {
    const { container } = renderC1("results", "writing");

    expect(await screen.findByText("Ein deutsches Zitat.")).toBeInTheDocument();
    expect(screen.getByText("中文引语翻译")).toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");
    const hideTranslation = screen.getByRole("button", { name: "隐藏 Zitate 1 中文翻译" });
    expect(hideTranslation.querySelector('img[src="/images/translate_icon.png"]')).toBeInTheDocument();
    expect(hideTranslation.querySelector("svg")).not.toBeInTheDocument();
    expect(hideTranslation).toHaveAttribute("title", "翻译");
    fireEvent.click(hideTranslation);
    expect(screen.queryByText("中文引语翻译")).not.toBeInTheDocument();
    expect(screen.getByText("第二条中文翻译")).toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");
    const showTranslation = screen.getByRole("button", { name: "显示 Zitate 1 中文翻译" });
    expect(showTranslation.querySelector('img[src="/images/translate_icon.png"]')).toBeInTheDocument();
    expect(showTranslation.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.getByText("Ein deutsches Zitat.")).toBeInTheDocument();
    expect(screen.getByText("der Beitrag")).toBeInTheDocument();
    fireEvent.click(showTranslation);
    expect(screen.getByText("中文引语翻译")).toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");
  });

  it("lets C1 writing review toggle quote and vocabulary translations and collapse vocabulary", async () => {
    const { container } = renderC1("writing_review", "writing");

    expect(await screen.findByText("Ein deutsches Zitat.")).toBeInTheDocument();
    expect(screen.getByText("中文引语翻译")).toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");
    const hideTranslation = screen.getByRole("button", { name: "隐藏 Zitate 1 中文翻译" });
    expect(hideTranslation.querySelector('img[src="/images/translate_icon.png"]')).toBeInTheDocument();
    expect(hideTranslation).toHaveAttribute("title", "翻译");
    expect(screen.getByRole("button", { name: "隐藏 Zitate 2 中文翻译" })).toHaveAttribute("title", "翻译");
    fireEvent.click(hideTranslation);
    expect(screen.queryByText("中文引语翻译")).not.toBeInTheDocument();
    expect(screen.getByText("第二条中文翻译")).toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");
    expect(screen.getByText("Ein deutsches Zitat.")).toBeInTheDocument();
    expect(screen.getByText("der Beitrag")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "显示 Zitate 1 中文翻译" }));
    const showTranslation = screen.getByRole("button", { name: "隐藏 Zitate 1 中文翻译" });
    expect(showTranslation.querySelector('img[src="/images/translate_icon.png"]')).toBeInTheDocument();
    expect(showTranslation.querySelector("svg")).not.toBeInTheDocument();
    expect(showTranslation).toHaveAttribute("title", "翻译");
    expect(screen.getByText("中文引语翻译")).toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");

    const collapse = screen.getByRole("button", { name: "收起词汇表" });
    expect(collapse).toHaveTextContent(/^$/);
    expect(collapse).toHaveAttribute("title", "收起词汇表");
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    expect(container.querySelector(".exam-vocabulary-card")).not.toBeInTheDocument();
    expect(container.querySelector(".writing-detail-vocabulary footer")).not.toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "展开词汇表" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(expand).toHaveTextContent(/^$/);
    expect(expand).toHaveAttribute("title", "展开词汇表");
    fireEvent.click(expand);
    expectVocabularyCard(container, "der Beitrag", "贡献");
    expect(container.querySelector(".writing-detail-vocabulary footer")).toHaveTextContent("1 / 1");
  });

  it("shows C1 vocabulary in writing review when the prompt has no quotes", async () => {
    const vocabularyOnlyExam = structuredClone(exam);
    delete vocabularyOnlyExam.parts.writing.content.quotes;
    vocabularyOnlyExam.parts.writing.content.vocabulary_pages = [{
      title: "Wortschatz 1",
      entries: [{ word: "die Möglichkeit", translation_zh: "可能性" }],
    }];

    const { container } = renderC1("writing_review", "writing", vocabularyOnlyExam);

    expect(await screen.findByRole("complementary", { name: "词汇表" })).toBeInTheDocument();
    expect(screen.getByText("die Möglichkeit")).toBeInTheDocument();
    expectVocabularyCard(container, "die Möglichkeit", "可能性");
    expect(screen.getByRole("heading", { name: "相关词汇" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wortschatz 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /中文翻译/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "写作引语" })).not.toBeInTheDocument();
    const collapseVocabulary = screen.getByRole("button", { name: "收起词汇表" });
    expect(collapseVocabulary).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapseVocabulary);
    expect(screen.getByRole("button", { name: "展开词汇表" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "展开词汇表" }));
    expect(screen.getByRole("button", { name: "收起词汇表" })).toHaveAttribute("aria-expanded", "true");
    expectVocabularyCard(container, "die Möglichkeit", "可能性");
  });

  it("keeps Wortschatz Chinese visible when C1 writing translations are hidden", async () => {
    const { container } = renderC1("results", "writing");

    expect(await screen.findByText("Ein deutsches Zitat.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "隐藏 Zitate 1 中文翻译" }));
    expect(screen.queryByText("中文引语翻译")).not.toBeInTheDocument();
    expectVocabularyCard(container, "der Beitrag", "贡献");
  });

  it("keeps the writing review vocabulary panel in the modal scroll flow", () => {
    expect(mockExamStyleSource).toMatch(/\.telc-mock-exam-writing-review \.writing-detail-vocabulary\s*\{[^}]*position:\s*static[^}]*width:\s*100%[^}]*margin-bottom:\s*1rem/s);
  });

  it("requires C1 candidates to choose one of the two writing tasks", async () => {
    const second = {
      ...exam.parts.writing,
      id: 91,
      exercise_base: { ...exam.parts.writing.exercise_base, title: "C1 Schreiben 2" },
      content: {
        ...exam.parts.writing.content,
        quotes: [{ text: "Zweites Thema.", translation_zh: "第二个主题" }],
      },
    };
    const choiceExam = {
      ...exam,
      parts: { ...exam.parts, writing_options: [exam.parts.writing, second] },
    };

    renderC1("writing", "writing", choiceExam);

    expect(await screen.findByRole("heading", { name: "Wählen Sie eine Aufgabe" })).toBeInTheDocument();
    expect(screen.getByText("Wählen Sie eines der folgenden zwei Themen. Schreiben Sie einen Text, in dem Sie Ihren eigenen Standpunkt dazu erarbeiten und argumentativ darlegen. Ihr Text soll mindestens 350 Wörter umlassen. Sie haben 70 Minuten Zeit")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thema 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thema 2" })).toBeInTheDocument();
    expect(screen.getByText("In einer Seminararbeit sollen Sie das Thema „C1 Schreiben“ aus unterschiedlichen Perspektiven beleuchten.")).toBeInTheDocument();
    expect(screen.getByText("In einer Seminararbeit sollen Sie das Thema „C1 Schreiben 2“ aus unterschiedlichen Perspektiven beleuchten.")).toBeInTheDocument();
    expect(screen.getAllByText("Sie können die unten stehenden Zitate zur Orientierung verwenden, aber auch andere Aspekte des Themas darlegen.")).toHaveLength(2);
    expect(screen.getAllByText("Argumentieren Sie überzeugend, führen Sie Beispiele an und gliedern Sie Ihren Text in Einleitung, Hauptteil und Schluss.")).toHaveLength(2);
    expect(screen.getByText("Ein deutsches Zitat.")).toBeInTheDocument();
    expect(screen.getByText("Zweites Thema.")).toBeInTheDocument();
    expect(screen.queryByText("中文引语翻译")).not.toBeInTheDocument();
    expect(screen.queryByText("第二个主题")).not.toBeInTheDocument();
    expect(screen.queryByText("贡献")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "词汇表" })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: "Wählen" });
    fireEvent.click(buttons[1]);
    expect(await screen.findByText("Zweites Thema.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wählen Sie eine Aufgabe" })).not.toBeInTheDocument();
  });

  it("shows the C1 written-exam maximum and pass line in results", async () => {
    renderC1("results", "writing");

    expect(await screen.findByText(/\/ 166$/)).toBeInTheDocument();
    expect(screen.getByText(/通过线为 99\.6 分/)).toBeInTheDocument();
    expect(screen.getByText("0 / 48")).toBeInTheDocument();
  });
});

describe("B1 writing translation visibility", () => {
  it("keeps the example translation hidden while writing and reveals it after submission", async () => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("exam-preparation-written-mock-v1:TELC:B1:7", JSON.stringify({
      exam: {
        exam_type: "TELC", level: "B1",
        parts: { writing: {
          id: 701,
          exercise_base: { title: "Schreiben", exam_type: "TELC" },
          request_text: "Thema", task_text: "Schreiben Sie eine E-Mail.", words_limit: 100,
          content: { request_translation_zh: "题目翻译", task_translation_zh: "要求翻译" },
          example_texts: [{ example_text: "Sehr geehrte Damen und Herren", translation_zh: "尊敬的女士们、先生们" }],
        } },
      },
      phase: "writing", deadline: Date.now() + 60_000, activePart: "writing", answers: {}, writingText: "",
      writingAssessment: {}, audioStep: 0, audioStepStartedAt: 0, attemptId: null, isFavorite: false, wasEarlySubmitted: false,
    }));
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b1/mock-exam"]}>
      <Routes><Route path="/modules/exam-preparation/telc/:level/mock-exam" element={<TelcMockExamPage />} /></Routes>
    </MemoryRouter>);

    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByText("尊敬的女士们、先生们")).not.toBeInTheDocument();
    expect(screen.queryByText("题目翻译")).not.toBeInTheDocument();
    expect(screen.queryByText("要求翻译")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提交写作并自评" }));
    expect(await screen.findByText("尊敬的女士们、先生们")).toBeInTheDocument();
  });
});
