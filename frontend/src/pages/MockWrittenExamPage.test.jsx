import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import MockWrittenExamPage from "./MockWrittenExamPage.jsx";
import MockExamAnswerSheet from "../components/examPreparation/MockExamAnswerSheet.jsx";
import { mockAnnotationScope } from "../utils/examTextAnnotations.js";
import {
  createMockExam,
  fetchSavedMockExam,
  submitSavedMockExam,
  updateSavedMockExam,
} from "../api/exam_preparation/mockExams.js";

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

const mockExamStyleSource = readFileSync(resolve("src/pages/MockWrittenExamPage.css"), "utf8");
const clozeExerciseStyleSource = readFileSync(resolve("src/pages/ClozeExercisePage.css"), "utf8");
const appLayoutStyleSource = readFileSync(resolve("src/layouts/AppLayout.css"), "utf8");
const readingAdStyleSource = readFileSync(resolve("src/pages/ReadingAdMatchingPage.css"), "utf8");

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));

vi.mock("../utils/confirmMockExamAction.js", () => ({
  confirmMockExamAction: vi.fn().mockResolvedValue(true),
}));

vi.mock("../api/exam_preparation/mockExams.js", async (importOriginal) => {
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
    render(<MockExamAnswerSheet
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
    render(<MockExamAnswerSheet
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
    render(<MockExamAnswerSheet
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
    render(<MockExamAnswerSheet
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
    render(<MockExamAnswerSheet
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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
    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const submit = await waitFor(() => {
      const button = container.querySelector(".mock-exam-writing-review__actions button");
      expect(button).toBeInTheDocument();
      return button;
    });
    const review = submit.closest(".mock-exam-writing-review");
    const scrollableContent = review.querySelector(".mock-exam-writing-review__body");

    expect(submit).toBeEnabled();
    expect(submit.parentElement).toHaveClass("mock-exam-writing-review__actions--sticky");
    expect(scrollableContent).toBeInTheDocument();
    expect(scrollableContent).not.toContainElement(submit);
    expect(screen.queryByText("自评已完成，可以提交结算。")).not.toBeInTheDocument();
    expect(screen.queryByText("请完成上方所有自评项后提交")).not.toBeInTheDocument();
    expect(getComputedStyle(submit).backgroundColor).toBe("rgb(242, 189, 97)");
    expect(getComputedStyle(submit).color).toBe("rgb(44, 42, 34)");
  });

  it("shows a gray disabled submit button while self-assessment is incomplete", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
    snapshot.writingAssessment.formal_accuracy = "";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const submit = await waitFor(() => {
      const button = container.querySelector(".mock-exam-writing-review__actions button");
      expect(button).toBeInTheDocument();
      return button;
    });
    expect(submit).toBeDisabled();
    expect(getComputedStyle(submit).backgroundColor).toBe("rgb(216, 221, 218)");
    expect(getComputedStyle(submit).color).toBe("rgb(104, 117, 111)");
  });

  it("labels the imported writing example consistently as Beispieltext", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
    snapshot.exam.parts.writing.example_texts = [{
      id: 91,
      label: "example_text",
      example_text: "Sehr geehrte Damen und Herren",
    }];
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
      ...mockExamState("reading_understanding", exercise),
      attemptId: 31,
    }));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(
      mockExamState("reading_understanding", exercise),
    ));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(
      mockExamState("listening_teil1", exercise, "listening"),
    ));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
      ".mock-cloze-matching-slot__chip",
    ],
  ])("centers the selected answer in mock-exam Sprachbausteine %s", async (_label, partKey, exercise, answers, selector) => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
      ...mockExamState(partKey, exercise),
      answers,
    }));

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: exercise.exercise_base.title });
    expect(getComputedStyle(container.querySelector(selector)).textAlign).toBe("center");
  });

  it("moves between reading and Sprachbausteine parts without entering Hören", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const exercise = container.querySelector(".mock-exam-paper");
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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

  it("keeps the countdown running and asks for a click when autoplay is blocked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    playSpy.mockRejectedValue(new DOMException("autoplay blocked", "NotAllowedError"));
    const exam = listeningRangeExam();
    exam.parts.listening_teil2.audio_file_url = "/teil2.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole("button", { name: "点击继续播放录音" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一部分" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一部分" })).toBeEnabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByText("00:59")).toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("continues the countdown when a preloaded recording starts after a break", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    exam.parts.listening_teil2.audio_file_url = "/teil2.m4a";
    exam.parts.listening_teil3.audio_file_url = "/teil3.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
      exam,
      phase: "listening",
      deadline: Date.now() + 60_000,
      activePart: "listening_teil1",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 1,
      audioStepStartedAt: Date.now() - 60_000,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("正在播放 · Hören · Teil 2")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByText("00:59")).toBeInTheDocument();
  });

  it("starts the original stream while the backup Blob is still downloading", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    expect(container.querySelector("audio")).toHaveAttribute("src", "/teil1.m4a");
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await Promise.resolve(); });
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("reloads the original stream once, then waits for the backup Blob with the countdown frozen", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    playSpy.mockRejectedValue(new Error("stream failed"));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("正在切换备用音频…")).toBeInTheDocument();
    expect(screen.getByText("01:00")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByText("01:00")).toBeInTheDocument();
  });

  it("continues the backup Blob from the interrupted position and resumes the countdown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    let finishDownload;
    vi.stubGlobal("fetch", vi.fn((url) => url === "/teil1.m4a"
      ? new Promise((resolve) => { finishDownload = resolve; })
      : Promise.resolve(successfulAudioResponse(url))));
    playSpy
      .mockRejectedValueOnce(new Error("stream failed"))
      .mockRejectedValueOnce(new Error("stream failed again"))
      .mockResolvedValue(undefined);
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    const audio = container.querySelector("audio");
    expect(audio).toHaveAttribute("src", "/teil1.m4a");
    audio.currentTime = 23;
    fireEvent.canPlay(audio);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("正在切换备用音频…")).toBeInTheDocument();
    expect(screen.getByText("01:00")).toBeInTheDocument();

    await act(async () => {
      finishDownload(successfulAudioResponse("/teil1.m4a"));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(audio).toHaveAttribute("src", "blob:/teil1.m4a");
    expect(audio.currentTime).toBe(23);
    expect(playSpy).toHaveBeenCalledTimes(3);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByText("00:59")).toBeInTheDocument();
  });

  it("cancels delayed playback retries after entering writing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    playSpy.mockRejectedValue(new Error("playback failed"));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await Promise.resolve(); });
    expect(playSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "完成本部分，进入写作" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: "Schreiben" })).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("does not restore the listening countdown when an old play request resolves in writing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    let finishPlay;
    playSpy.mockImplementation(() => new Promise((resolve) => { finishPlay = resolve; }));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "完成本部分，进入写作" }));
    await act(async () => { await Promise.resolve(); });

    finishPlay();
    await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000); });

    expect(screen.getByRole("heading", { name: "Schreiben" })).toBeInTheDocument();
    expect(screen.getByText("29:59")).toBeInTheDocument();
  });

  it("resumes the frozen countdown only after autoplay succeeds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    let resolvePlay;
    playSpy.mockImplementation(() => new Promise((resolve) => { resolvePlay = resolve; }));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByText("01:00")).toBeInTheDocument();

    await act(async () => { resolvePlay(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(screen.getByText("00:59")).toBeInTheDocument();
  });

  it("does not block streaming autoplay while the backup audio downloads", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const exam = listeningRangeExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "/teil1.m4a"));
    fireEvent.canPlay(container.querySelector("audio"));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("正在加载听力音频…")).not.toBeInTheDocument();
    expect(screen.getByText("正在播放 · Hören · Teil 1")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("preloads all three listening recordings when the exam starts", async () => {
    const exam = continuousNumberingExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    exam.parts.listening_teil2 = { exercise_base: { title: "Hören 2" }, audio_file_url: "/teil2.m4a", questions: [] };
    exam.parts.listening_teil3 = { exercise_base: { title: "Hören 3" }, audio_file_url: "/teil3.m4a", questions: [] };
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
      exam,
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenCalledWith("/teil1.m4a", expect.any(Object));
    expect(fetch).toHaveBeenCalledWith("/teil2.m4a", expect.any(Object));
    expect(fetch).toHaveBeenCalledWith("/teil3.m4a", expect.any(Object));
  });

  it("does not preload listening recordings while reviewing completed results", async () => {
    const exam = continuousNumberingExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    exam.parts.listening_teil2 = { exercise_base: { title: "Hören 2" }, audio_file_url: "/teil2.m4a", questions: [] };
    exam.parts.listening_teil3 = { exercise_base: { title: "Hören 3" }, audio_file_url: "/teil3.m4a", questions: [] };
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
      exam,
      phase: "results",
      deadline: 0,
      activePart: "reading_title_matching",
      answers: {},
      writingText: "",
      writingAssessment: {},
      audioStep: 5,
      audioStepStartedAt: 0,
      attemptId: null,
      isFavorite: false,
      wasEarlySubmitted: false,
    }));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await act(async () => {
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("enables available part arrows after listening audio has finished", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "上一部分" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一部分" })).toBeEnabled();
  });

  it("crosses from Sprachbausteine to Hören with arrows in the completed review", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "下一部分" }));
    expect(screen.getByRole("heading", { name: "7. Hörfrage" })).toBeInTheDocument();
  });

  it("does not show part arrows in Schreiben", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    expect(await screen.findByRole("button", { name: "提交写作并自评" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一部分" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一部分" })).not.toBeInTheDocument();
  });

  it("does not show part arrows for Schreiben in the completed review", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "考试结果与答案回顾" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上一部分" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一部分" })).not.toBeInTheDocument();
  });

  it("shows only reading rows in the answer sheet during the reading phase", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    const paper = container.querySelector(".mock-exam-paper");
    expect(within(answerSheet).getByRole("heading", { name: "Lesen & Sprachbausteine" })).toBeInTheDocument();
    expect(within(answerSheet).queryByRole("heading", { name: "Hören" })).not.toBeInTheDocument();
    expect(paper.compareDocumentPosition(answerSheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll(".mock-answer-sheet")).toHaveLength(1);
  });

  it("continues question numbers across all reading and Sprachbausteine parts", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    const paper = () => within(container.querySelector(".mock-exam-paper"));

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    const paper = within(container.querySelector(".mock-exam-paper"));

    expect(await paper.findByRole("heading", { name: "7. Hörfrage" })).toBeInTheDocument();
  });

  it("uses the global mock-exam ranges in every listening introduction", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    const introduction = () => container.querySelector(".mock-exam-introduction");

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
    const exam = continuousNumberingExam();
    exam.parts.listening_teil1.audio_file_url = "/teil1.m4a";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const statusTitle = await screen.findByText("正在播放 · Hören · Teil 1");
    expect(statusTitle).toHaveClass("mock-exam-audio-status__title");
    expect(mockExamStyleSource).toMatch(/\.mock-exam-audio-status \.mock-exam-audio-status__title \{[^}]*font-size: 1\.05rem;/);
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
      "exam-preparation-written-mock-v1:7",
      JSON.stringify(mockExamState(partKey, exercise, phase)),
    );

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const introductionText = await screen.findByText(expectedText);
    const introduction = introductionText.closest(".mock-exam-introduction");
    const heading = container.querySelector(".mock-exam-paper__heading");
    expect(screen.getByText("Einleitung")).toBeInTheDocument();
    expect(introduction).toBeInTheDocument();
    expect(heading.nextElementSibling).toBe(introduction);
  });

  it("keeps answer-sheet option geometry stable when an answer is selected", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    expect(within(answerSheet).getByRole("heading", { name: "Hören" })).toBeInTheDocument();
    expect(within(answerSheet).queryByRole("heading", { name: "Lesen & Sprachbausteine" })).not.toBeInTheDocument();
  });

  it("shows reading and listening rows together in the completed exam review", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const answerSheet = await screen.findByRole("region", { name: "答题卡" });
    expect(within(answerSheet).getByRole("heading", { name: "Lesen & Sprachbausteine" })).toBeInTheDocument();
    expect(within(answerSheet).getByRole("heading", { name: "Hören" })).toBeInTheDocument();
  });

  it("uses the regular reading-ad carousel and one-question-at-a-time layout", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    expect(await screen.findByText("Situation eins")).toBeInTheDocument();
    expect(screen.queryByText("Situation zwei")).not.toBeInTheDocument();
    expect(container.querySelector(".reading-ad-carousel")).toBeInTheDocument();
    expect(container.querySelectorAll(".reading-ad-card")).toHaveLength(2);
  });

  it("hides question favorites in Lesen Teil 1 until answers are shown", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    expect(await screen.findByText("Text eins")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏这道题" })).not.toBeInTheDocument();
  });

  it("shows each Lesen Teil 1 option letter before its title", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: "Überschrift auswählen" }));
    const firstOption = await screen.findByRole("button", { name: "A Erster Titel" });
    expect(screen.getByRole("button", { name: "B Zweiter Titel" })).toBeInTheDocument();
    fireEvent.click(firstOption);

    const selectedAnswer = screen.getByRole("button", { name: "A Erster Titel" });
    expect(within(selectedAnswer).getByText("A")).toHaveClass("reading-title-select__key");
    expect(within(selectedAnswer).getByText("Erster Titel")).toHaveClass("reading-title-select__label");
  });

  it("keeps the Sprachbausteine 2 option pool visible with compact text spacing", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const pool = await screen.findByRole("region", { name: "选项区" });
    const text = container.querySelector(".mock-cloze-matching-text");
    expect(pool).toHaveClass("mock-cloze-matching-pool--sticky");
    expect(text).toHaveClass("mock-cloze-matching-text--compact");
  });

  it("hides question favorites in Sprachbausteine Teil 2 until answers are shown", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    expect(await screen.findByRole("region", { name: "选项区" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "收藏这道题" })).not.toBeInTheDocument();
  });

  it("keeps embedded mobile ad cards from competing with the sticky exam header", () => {
    expect(mockExamStyleSource).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.mock-exam-page \.reading-ad-sticky-stack\s*\{[^}]*position:\s*static/
    );
  });

  it("limits the sticky Sprachbausteine option pool to the available viewport height", () => {
    expect(mockExamStyleSource).toMatch(
      /\.mock-cloze-matching-pool\s*\{[^}]*max-height:\s*calc\(100dvh - [^)]+\)[^}]*overflow-y:\s*auto/
    );
  });

  it("scrolls the exam header away and sticks the option pool to the viewport top", () => {
    const { container } = render(
      <>
        <style>{`${appLayoutStyleSource}\n${mockExamStyleSource}`}</style>
        <div className="app-layout">
          <main className="mock-exam-page">
            <header className="mock-exam-header" />
            <section className="mock-cloze-matching-pool" />
          </main>
        </div>
      </>
    );

    const layout = container.querySelector(".app-layout");
    const header = container.querySelector(".mock-exam-header");
    const pool = container.querySelector(".mock-cloze-matching-pool");

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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

  it("labels the single Teil 3 audio-file playback as einmal", async () => {
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await waitFor(() => expect(container.querySelector("audio")).toHaveAttribute("src", "/teil3.m4a"));
    await waitFor(() => expect(screen.getByText("einmal")).toBeInTheDocument());
  });
});

describe("mock exam answer review", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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
    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const feedback = await screen.findByText("未作答");
    const feedbackCard = feedback.closest(".reading-understanding-feedback");

    expect(feedbackCard).toHaveClass("reading-understanding-feedback--wrong");
    expect(feedbackCard).toHaveTextContent("Richtige Antwort: B - 正确选项");
    expect(feedbackCard).toHaveTextContent("Erklärung: 这是未作答时仍应展示的解析。");
    expect(container.querySelector(".mock-exam-feedback")).not.toBeInTheDocument();
  });

  it("keeps a wrong selected option visible and renders option-level explanations", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
    snapshot.answers = { "reading_understanding:101": "A" };
    snapshot.exam.parts.reading_understanding.questions[0].explanation = "";
    snapshot.exam.parts.reading_understanding.questions[0].explanation_scope = "option";
    snapshot.exam.parts.reading_understanding.questions[0].answer_options[0].explanation = "A 选项的解析。";
    snapshot.exam.parts.reading_understanding.questions[0].answer_options[1].explanation = "B 选项的解析。";
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const feedback = await screen.findByText("Falsch");
    const feedbackCard = feedback.closest(".reading-understanding-feedback");
    expect(container.querySelector(".reading-understanding-option--wrong")).toBeInTheDocument();
    expect(container.querySelector(".reading-understanding-option--correct")).toBeInTheDocument();
    expect(feedbackCard).toHaveTextContent("A – 错误选项");
    expect(feedbackCard).toHaveTextContent("A 选项的解析。");
    expect(feedbackCard).toHaveTextContent("B 选项的解析。");
  });

  it("marks both the wrong selection and the correct answer in the review answer sheet", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
    snapshot.answers = { "reading_understanding:101": "A" };
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const wrongBubble = await screen.findByRole("button", { name: "第 1 题，答案 A" });
    const correctBubble = screen.getByRole("button", { name: "第 1 题，答案 B" });
    expect(wrongBubble).toHaveClass("is-wrong");
    expect(correctBubble).toHaveClass("is-correct");
  });

  it("shows the regular title-matching feedback card and explanation when unanswered", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const feedback = await screen.findByText("未作答");
    const feedbackCard = feedback.closest(".reading-title-feedback");
    expect(feedbackCard).toHaveClass("reading-title-feedback--wrong");
    expect(feedbackCard).toHaveTextContent("Richtige Antwort: B - 正确标题");
    expect(feedbackCard).toHaveTextContent("Erklärung: 标题匹配解析。");
    expect(feedbackCard).toContainElement(screen.getByRole("button", { name: "收藏这道题" }));
  });

  it("shows a cloze explanation for an unanswered Sprachbausteine blank", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const explanation = await screen.findByText("这里需要使用正确的动词形式。");
    expect(explanation.closest(".cloze-choice-inline-explanation")).toBeInTheDocument();
    expect(explanation.closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("shows the cloze-matching explanation card for an unanswered blank", async () => {
    const snapshot = JSON.parse(sessionStorage.getItem("exam-preparation-written-mock-v1:7"));
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify({
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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
    const { container } = render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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
          content_with_placeholders: "Vor {{blank_1}} nach {{blank_2}}.",
          blanks: [
            { id: 1, blank_key: "blank_1", blank_number: 1, options: [{ option_key: "A", option_text: "eins", is_correct: true }] },
            { id: 2, blank_key: "blank_2", blank_number: 2, options: [{ option_key: "B", option_text: "zwei", is_correct: true }] },
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    const choiceFlows = [...document.querySelectorAll('[data-exam-annotation-flow^="cloze_choice:"]')];
    expect(new Set(choiceFlows.map((node) => node.dataset.examAnnotationFlow))).toEqual(new Set(["cloze_choice:source:0"]));
    expect(choiceFlows.map((node) => node.dataset.examAnnotationRegion)).toEqual([
      "cloze_choice:source:0", "cloze_choice:source:2", "cloze_choice:source:4",
    ]);
    fireEvent.click(document.querySelector(".mock-exam-inline-answer button"));
    expect(document.querySelector('[data-exam-annotation-region^="cloze_choice:option:"]')).toBeNull();
    expect(screen.getByRole("dialog").querySelector("[data-exam-annotation-region]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /eins/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sprachbausteine · Teil 2" }));
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    expect(new Set([...document.querySelectorAll('[data-exam-annotation-flow^="cloze_matching:"]')]
      .map((node) => node.dataset.examAnnotationFlow))).toEqual(new Set(["cloze_matching:source:0"]));
    expect(document.querySelector('[data-exam-annotation-region^="cloze_matching:option:"]')).toBeNull();
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 1" });
    const roots = [...document.querySelectorAll('[data-exam-annotation-flow="cloze_choice:source:0"]')];
    selectAcrossText(roots[0], 0, roots[roots.length - 1], roots[roots.length - 1].textContent.length);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    const scope = mockAnnotationScope(31);
    const marked = JSON.parse(sessionStorage.getItem(scope));
    expect(Object.keys(marked.regions).sort()).toEqual([
      "cloze_choice:source:0", "cloze_choice:source:2", "cloze_choice:source:4",
    ]);

    fireEvent.click(document.querySelector(".mock-exam-inline-answer button"));
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const roots = [...document.querySelectorAll('[data-exam-annotation-flow="cloze_matching:source:0"]')];
    selectAcrossText(roots[0], 0, roots[roots.length - 1], roots[roots.length - 1].textContent.length);
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    const scope = mockAnnotationScope(31);
    const marked = JSON.parse(sessionStorage.getItem(scope));
    expect(Object.keys(marked.regions).sort()).toEqual([
      "cloze_matching:source:0", "cloze_matching:source:2", "cloze_matching:source:4",
    ]);

    const firstSlot = document.querySelector('[data-mock-cloze-blank="blank_1"]');
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const poolText = screen.getByRole("button", { name: "lerne" });
    const slot = document.querySelector(".mock-cloze-matching-slot");
    const pool = document.querySelector(".mock-cloze-matching-pool");
    const transferValues = {};
    const dataTransfer = {
      setData: vi.fn((type, value) => { transferValues[type] = value; }),
      getData: vi.fn((type) => transferValues[type] || ""),
    };
    const pointerDown = new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" });
    poolText.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(poolText).toHaveAttribute("draggable", "true");
    expect(document.querySelector(".mock-cloze-matching-pool__handle")).toBeNull();
    fireEvent.dragStart(poolText, { dataTransfer });
    fireEvent.dragOver(slot);
    fireEvent.drop(slot, { dataTransfer });
    await waitFor(() => expect(slot).toHaveTextContent("lerne"));
    const placedCard = slot.querySelector(".mock-cloze-matching-slot__chip");
    expect(placedCard).toHaveAttribute("draggable", "true");
    expect(placedCard.querySelector(".mock-cloze-matching-pool__handle")).toBeNull();
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
    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Sprachbausteine 2" });
    const option = screen.getByRole("button", { name: "lerne" });
    const slot = document.querySelector(".mock-cloze-matching-slot");
    expect(document.querySelector(".mock-cloze-matching-pool__handle")).toBeNull();
    fireEvent.pointerDown(option, { pointerType: "touch", pointerId: 1, clientX: 1, clientY: 1 });
    expect(document.querySelector(".mock-cloze-matching-touch-preview")).toBeInTheDocument();
    fireEvent.pointerMove(option, { pointerType: "touch", pointerId: 1, clientX: 2, clientY: 2 });
    fireEvent.pointerUp(slot, { pointerType: "touch", pointerId: 1, clientX: 2, clientY: 2 });
    await waitFor(() => expect(slot).toHaveTextContent("lerne"));
    expect(document.querySelector(".mock-cloze-matching-touch-preview")).not.toBeInTheDocument();
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
    sessionStorage.setItem("exam-preparation-written-mock-v1:7", JSON.stringify(snapshot));
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "再考一套" }));

    await waitFor(() => expect(createMockExam).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Lesen & Sprachbausteine" })).toBeInTheDocument());
    expect(sessionStorage.getItem(mockAnnotationScope(31))).toBeNull();
    expect(sessionStorage.getItem(mockAnnotationScope(42))).toBeNull();
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

    render(<MemoryRouter initialEntries={["/modules/exam-preparation/mock-exam?attempt=77"]}><MockWrittenExamPage /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Lesen 2" });

    expect(sessionStorage.getItem(mockAnnotationScope(77))).toBe(value);
  });

  it.each([
    ["saved", "/modules/exam-preparation/mock-exam?saved=88", { is_completed: true, id: 88 }],
    ["results", "/modules/exam-preparation/mock-exam", null],
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

    render(<MemoryRouter initialEntries={[route]}><MockWrittenExamPage /></MemoryRouter>);
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);
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
