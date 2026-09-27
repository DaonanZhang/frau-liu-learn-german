import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import MockWrittenExamPage from "./MockWrittenExamPage.jsx";
import mockExamStyles from "./MockWrittenExamPage.css?raw";

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

describe("writing self-assessment", () => {
  let styleElement;

  beforeAll(() => {
    styleElement = document.createElement("style");
    styleElement.textContent = mockExamStyles;
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
    expect(explanation.closest(".cloze-feedback-card")).toBeInTheDocument();
  });
});
