import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import MockWrittenExamPage from "./MockWrittenExamPage.jsx";
import MockExamAnswerSheet from "../components/examPreparation/MockExamAnswerSheet.jsx";

const mockExamStyleSource = readFileSync(resolve("src/pages/MockWrittenExamPage.css"), "utf8");
const readingAdStyleSource = readFileSync(resolve("src/pages/ReadingAdMatchingPage.css"), "utf8");

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: { id: 7 } }),
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
  let playSpy;
  let pauseSpy;

  beforeAll(() => {
    styleElement = document.createElement("style");
    styleElement.textContent = mockExamStyleSource;
    document.head.append(styleElement);
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterAll(() => {
    styleElement.remove();
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

    render(<MemoryRouter><MockWrittenExamPage /></MemoryRouter>);

    const statusTitle = await screen.findByText("正在播放 · Hören · Teil 1");
    expect(statusTitle).toHaveClass("mock-exam-audio-status__title");
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
    expect(screen.getByText("zweimal")).toBeInTheDocument();
    expect(screen.queryByText("第 2 / 2 遍")).not.toBeInTheDocument();

    fireEvent.ended(audio);

    expect(screen.getByText("zweimal")).toBeInTheDocument();
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
    expect(screen.getByText("einmal")).toBeInTheDocument();
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
    expect(feedbackCard).toContainElement(screen.getByRole("button", { name: "收藏这道题" }));
  });
});
