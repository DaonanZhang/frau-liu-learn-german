import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "../api/auth/index.js";
import {
  fetchWritingExerciseDetail,
  } from "../api/exam_preparation/writingExercises.js";
import {
  fetchWritingExampleTextStates,
  fetchWritingExerciseStates,
  saveWritingExampleTextState,
  saveWritingExerciseState,
} from "../api/exam_preparation/userExerciseStates.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import { updateMyProfile } from "../api/auth/profile.js";
import ExamPreparationWritingDetailPage from "./ExamPreparationWritingDetailPage.jsx";

const writingStyles = readFileSync(resolve("src/pages/ExamPreparationWritingDetailPage.css"), "utf8");

vi.mock("../api/auth/index.js", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../api/auth/profile.js", () => ({
  updateMyProfile: vi.fn(),
}));

vi.mock("../api/exam_preparation/writingExercises.js", () => ({
  fetchWritingExerciseDetail: vi.fn(),
}));

vi.mock("../api/exam_preparation/userExerciseStates.js", () => ({
  fetchWritingExampleTextStates: vi.fn(),
  fetchWritingExerciseStates: vi.fn(),
  saveWritingExampleTextState: vi.fn(),
  saveWritingExerciseState: vi.fn(),
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

describe("ExamPreparationWritingDetailPage text annotations", () => {
  const scope = exerciseAnnotationScope("WRITING", 41);

  beforeEach(() => {
    sessionStorage.clear();
    window.Highlight = FakeHighlight;
    window.CSS = { highlights: new Map() };
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    useAuth.mockReturnValue({
      user: {
        id: 7,
        has_seen_schreiben_guide: true,
        has_seen_b2_schreiben_guide: true,
      },
      reloadMe: vi.fn(),
    });
    updateMyProfile.mockResolvedValue({});
    fetchWritingExerciseDetail.mockResolvedValue({
      id: 41,
      exercise_base: {
        external_id: "41",
        level: "B1",
        exam_type: "telc",
        exercise_type: "WRITING",
      },
      request_text: "Schreiben Sie eine E-Mail an Ihre Freundin.",
      task_text: "Entschuldigen Sie sich und nennen Sie einen Grund.",
      time_limit_minutes: 30,
      words_limit: 80,
      example_texts: [{
        id: 501,
        note: "Achten Sie auf die Anrede.",
        example_text: "Liebe Anna, leider kann ich nicht kommen.",
      }],
    });
    fetchWritingExerciseStates.mockResolvedValue({ results: [] });
    fetchWritingExampleTextStates.mockResolvedValue({ results: [] });
    saveWritingExampleTextState.mockResolvedValue({});
    saveWritingExerciseState.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.Highlight;
    delete window.CSS;
    delete window.matchMedia;
    delete window.HTMLElement.prototype.scrollIntoView;
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/exercise/41"]}>
        <Routes>
          <Route path="/exercise/:exerciseId" element={<ExamPreparationWritingDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("registers the real writing scope and learning regions while excluding controls and draft input", async () => {
    renderPage();

    const emailHeading = await screen.findByRole("heading", { name: "E-Mail" });
    expect(screen.queryByRole("button", { name: /中文翻译/ })).not.toBeInTheDocument();
    expect(emailHeading.closest(".writing-detail-request-panel"))
      .toHaveClass("writing-detail-request-panel--email");
    const emailPanel = emailHeading.closest(".writing-detail-request-panel");
    const recipient = within(emailPanel).getByText("An: Prüfende");
    expect(recipient).toBeInTheDocument();
    expect(recipient.closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.queryByRole("heading", { name: "邮件" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Anleitung");
    expect(screen.queryByRole("heading", { name: /^(Anleitung|Aufgabe)$/ })).not.toBeInTheDocument();
    expect((await screen.findByText("Schreiben Sie eine E-Mail an Ihre Freundin.")).closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "task",
    );
    expect(screen.getByText("Entschuldigen Sie sich und nennen Sie einen Grund.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "prompt",
    );
    expect(screen.getByRole("link", { name: "← 返回写作模块" })).not.toHaveAttribute(
      "data-exam-annotation-region",
    );
    expect(screen.getByRole("textbox").closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("textbox").closest(".writing-detail-input-card--long")).toBeNull();
    expect(screen.getByRole("button", { name: /开始计时/ }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "Prüfen" }).closest("[data-exam-annotation-region]")).toBeNull();
  });

  it("renders stored br variants as line breaks while keeping other tags as text", async () => {
    fetchWritingExerciseDetail.mockResolvedValueOnce({
      id: 41,
      exercise_base: { level: "B1", exam_type: "telc", exercise_type: "WRITING" },
      request_text: "Erste<br>Zeile<BR/>Dritte<br /><strong>fett</strong>",
      task_text: "Aufgabe<br >weiter",
      example_texts: [],
    });

    renderPage();

    const task = await screen.findByText((_, element) => (
      element?.getAttribute("data-exam-annotation-region") === "task"
    ));
    expect(task).toHaveTextContent("ErsteZeileDritte<strong>fett</strong>");
    expect(task.querySelectorAll("br")).toHaveLength(3);
    expect(task.querySelector("strong")).toBeNull();
  });

  it("shows TELC B2 writing as a minimum of 150 words", async () => {
    fetchWritingExerciseDetail.mockResolvedValueOnce({
      id: 41,
      exercise_base: { level: "B2", exam_type: "TELC", exercise_type: "WRITING" },
      request_text: "Schreiben Sie eine Reklamation.",
      task_text: "Begründen Sie Ihre Beschwerde.",
      time_limit_minutes: 30,
      words_limit: 150,
      example_texts: [],
    });

    renderPage();

    const requestText = await screen.findByText("Schreiben Sie eine Reklamation.");
    const requestPanel = requestText.closest(".writing-detail-request-panel");
    expect(requestPanel).toHaveClass("writing-detail-request-panel--announcement");
    const announcementTitle = requestPanel.querySelector(".writing-detail-request-panel__announcement-title");
    expect(within(announcementTitle).getByRole("heading", { name: "Aushang" })).toBeInTheDocument();
    expect(announcementTitle.closest(".writing-detail-request-panel__announcement-sheet")).toBeNull();
    expect(within(requestPanel).queryByRole("heading", { name: "公告" })).not.toBeInTheDocument();
    const announcementSheet = requestPanel.querySelector(".writing-detail-request-panel__announcement-sheet");
    expect(announcementSheet).toBeInTheDocument();
    expect(announcementSheet.querySelector(".writing-detail-request-panel__notice-pin")).toHaveAttribute("aria-hidden", "true");
    expect(announcementSheet.querySelector("h2")).toBeNull();
    expect(announcementSheet.children).toHaveLength(2);
    expect(requestPanel.querySelector(".writing-detail-request-panel__notice-mark")).toBeNull();
    expect(requestText.closest('[data-exam-annotation-region="task"]')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Anleitung");
    expect(screen.queryByRole("heading", { name: /^(Anleitung|Aufgabe)$/ })).not.toBeInTheDocument();
    expect(await screen.findByText("最少 150 词")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /中文翻译/ })).not.toBeInTheDocument();
    expect(document.querySelector(".writing-detail-actions__meta")).not.toBeInTheDocument();
    expect(screen.getAllByText("0 词")).toHaveLength(1);
    expect(screen.getByRole("textbox").closest(".writing-detail-input-card--long")).toBeInTheDocument();
    expect(screen.queryByText("最多 150 词")).not.toBeInTheDocument();
  });

  it("shows the C1 quotations, 350-word target, 70-minute timer, and paged vocabulary", async () => {
    fetchWritingExerciseDetail.mockResolvedValueOnce({
      id: 41,
      exercise_base: { external_id: "41", level: "C1", exam_type: "TELC", exercise_type: "WRITING" },
      request_text: "Schreiben Sie einen argumentativen Text.",
      task_text: "Nehmen Sie zu beiden Zitaten Stellung.",
      time_limit_minutes: 70,
      words_limit: 350,
      content: {
        quotes: [
          { text: "Wissen ist Macht.", translation_zh: "知识就是力量。" },
          { text: "Lernen endet nie.", translation_zh: "学习永无止境。" },
        ],
        vocabulary_pages: [
          { title: "Wortschatz 1", entries: [{ word: "die Erkenntnis", translation_zh: "认识" }] },
          { title: "Wortschatz", entries: [{ word: "die Voraussetzung", translation_zh: "前提" }] },
        ],
      },
      example_texts: [{ id: 501, example_text: "Bildung eröffnet neue Möglichkeiten." }],
    });
    renderPage();

    expect(await screen.findByText("Wissen ist Macht.")).toBeInTheDocument();
    expect(screen.getByText("知识就是力量。")).toBeInTheDocument();
    expect(screen.getByText("Lernen endet nie.")).toBeInTheDocument();
    expect(screen.getByText("学习永无止境。")).toBeInTheDocument();
    const taskCard = screen.getByRole("heading", { name: "写作要求" }).closest(".writing-detail-task-card");
    const quoteSection = screen.getByRole("region", { name: "引语" });
    expect(taskCard).toHaveClass("writing-detail-task-card--c1");
    expect(within(quoteSection).getByRole("heading", { name: "Zitate 1" })).toBeInTheDocument();
    expect(within(quoteSection).getByRole("heading", { name: "Zitate 2" })).toBeInTheDocument();
    expect(screen.getByText("最少 350 词")).toBeInTheDocument();
    const timerButton = screen.getByRole("button", { name: "开始计时：70:00" });
    expect(timerButton).toBeInTheDocument();
    const firstQuote = within(quoteSection).getByRole("heading", { name: "Zitate 1" }).closest(".writing-detail-c1-quote");
    const secondQuote = within(quoteSection).getByRole("heading", { name: "Zitate 2" }).closest(".writing-detail-c1-quote");
    const translationToggle = within(firstQuote).getByRole("button", { name: "隐藏 Zitate 1 中文翻译" });
    expect(translationToggle.querySelector('img[src="/images/translate_icon.png"]')).toBeInTheDocument();
    expect(translationToggle.querySelector("svg")).not.toBeInTheDocument();
    expect(translationToggle).toHaveAttribute("title", "翻译");
    expect(within(secondQuote).getByRole("button", { name: "隐藏 Zitate 2 中文翻译" })).toBeInTheDocument();

    const vocabulary = screen.getByRole("complementary", { name: "词汇表" });
    expect(vocabulary.querySelector("footer")).toHaveClass("writing-detail-vocabulary__pagination");
    expect(within(vocabulary).getByText("相关词汇")).toBeInTheDocument();
    expect(within(vocabulary).queryByText("Wortschatz 1")).not.toBeInTheDocument();
    expect(vocabulary).toHaveClass("writing-detail-vocabulary");
    expect(taskCard.compareDocumentPosition(quoteSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quoteSection.compareDocumentPosition(vocabulary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vocabulary.querySelector(".writing-detail-vocabulary__card")).toBeInTheDocument();
    expect(writingStyles).toMatch(/\.writing-detail-vocabulary\s*\{[^}]*position:\s*static[^}]*width:\s*100%/s);
    expect(writingStyles).toMatch(/\.writing-detail-vocabulary__cards\s*\{[^}]*grid-template-columns:/s);
    expect(within(vocabulary).getByText("1 / 2")).toBeInTheDocument();
    expect(within(vocabulary).getByText((_, element) => element?.tagName === "P" && element.textContent === "die Erkenntnis · 认识")).toBeInTheDocument();
    fireEvent.click(translationToggle);
    expect(screen.queryByText("知识就是力量。")).not.toBeInTheDocument();
    expect(screen.getByText("学习永无止境。")).toBeInTheDocument();
    expect(within(vocabulary).getByText((_, element) => element?.tagName === "P" && element.textContent === "die Erkenntnis · 认识")).toBeInTheDocument();
    const showTranslation = within(firstQuote).getByRole("button", { name: "显示 Zitate 1 中文翻译" });
    expect(showTranslation.querySelector('img[src="/images/translate_icon.png"]')).toBeInTheDocument();
    expect(showTranslation.querySelector("svg")).not.toBeInTheDocument();
    expect(showTranslation).toHaveAttribute("title", "翻译");
    fireEvent.click(within(vocabulary).getByRole("button", { name: "下一页" }));
    expect(within(vocabulary).getByText("2 / 2")).toBeInTheDocument();
    expect(within(vocabulary).getByText((_, element) => element?.tagName === "P" && element.textContent === "die Voraussetzung · 前提")).toBeInTheDocument();
    const collapseVocabulary = within(vocabulary).getByRole("button", { name: "收起词汇表" });
    expect(collapseVocabulary).toHaveAttribute("title", "收起词汇表");
    expect(collapseVocabulary.querySelector('path[d="m6 10 6 6 6-6"]')).toBeInTheDocument();
    fireEvent.click(collapseVocabulary);
    const expandVocabulary = within(vocabulary).getByRole("button", { name: "展开词汇表" });
    expect(expandVocabulary).toHaveTextContent(/^$/);
    expect(expandVocabulary).toHaveAttribute("aria-expanded", "false");
    expect(expandVocabulary.querySelector('path[d="m6 14 6-6 6 6"]')).toBeInTheDocument();
    expect(within(vocabulary).queryByText("2 / 2")).not.toBeInTheDocument();
    fireEvent.click(within(vocabulary).getByRole("button", { name: "展开词汇表" }));
    expect(within(vocabulary).getByRole("button", { name: "收起词汇表" })).toHaveAttribute("aria-expanded", "true");
    expect(within(vocabulary).getByText("2 / 2")).toBeInTheDocument();
    expect(within(vocabulary).getByText((_, element) => element?.tagName === "P" && element.textContent === "die Voraussetzung · 前提")).toBeInTheDocument();
    fireEvent.click(showTranslation);
    expect(screen.getByText("知识就是力量。")).toBeInTheDocument();
    expect(within(vocabulary).getByText((_, element) => element?.tagName === "P" && element.textContent === "die Voraussetzung · 前提")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Bildung beeinflusst unsere Zukunft." } });
    expect(screen.getByRole("textbox")).toHaveValue("Bildung beeinflusst unsere Zukunft.");
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(await screen.findByText("Bildung eröffnet neue Möglichkeiten.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "开始计时：70:00" })).toBeInTheDocument();
  });

  it("opens the B2 guide once and saves its own completion field", async () => {
    useAuth.mockReturnValue({
      user: {
        id: 7,
        has_seen_schreiben_guide: true,
        has_seen_b2_schreiben_guide: false,
      },
      reloadMe: vi.fn(),
    });
    fetchWritingExerciseDetail.mockResolvedValueOnce({
      id: 41,
      exercise_base: { level: "B2", exam_type: "TELC", exercise_type: "WRITING" },
      request_text: "Schreiben Sie eine Reklamation.",
      task_text: "Begründen Sie Ihre Beschwerde.",
      words_limit: 150,
      example_texts: [],
    });

    renderPage();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "跳过引导" }));
    await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({
      has_seen_b2_schreiben_guide: true,
    }));
  });

  it("lets B2 users reopen the guide from the small button before the timer", async () => {
    fetchWritingExerciseDetail.mockResolvedValueOnce({
      id: 41,
      exercise_base: { level: "B2", exam_type: "TELC", exercise_type: "WRITING" },
      request_text: "Schreiben Sie eine Reklamation.",
      task_text: "Begründen Sie Ihre Beschwerde.",
      words_limit: 150,
      example_texts: [],
    });

    renderPage();

    const replayButton = await screen.findByRole("button", { name: "查看引导" });
    const timerButton = screen.getByRole("button", { name: /开始计时/ });
    expect(replayButton.nextElementSibling).toBe(timerButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(replayButton);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("accepts draft input, preserves marks after Prüfen, and clears only this scope on Wiederholen", async () => {
    const unrelatedScope = exerciseAnnotationScope("READING", 9);
    sessionStorage.setItem(unrelatedScope, JSON.stringify({
      version: 1,
      regions: { passage: [{ start: 0, end: 4, highlight: true, underline: false }] },
    }));
    renderPage();

    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Liebe Anna" } });
    expect(textarea).toHaveValue("Liebe Anna");

    const prompt = screen.getByText("Entschuldigen Sie sich und nennen Sie einen Grund.");
    selectText(prompt, 0, 11);
    document.dispatchEvent(new Event("selectionchange"));
    fireEvent.click(await screen.findByRole("button", { name: "高亮" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions.prompt).toEqual([{
      start: 0,
      end: 11,
      highlight: true,
      underline: false,
    }]);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /开始计时/ }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /计时中：29:59/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(JSON.parse(sessionStorage.getItem(scope)).regions.prompt).toHaveLength(1);
    expect(screen.getByText("Achten Sie auf die Anrede.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "explanation:501",
    );
    expect(screen.getByText("Liebe Anna, leider kann ich nicht kommen.").closest("[data-exam-annotation-region]"))
      .toHaveAttribute(
      "data-exam-annotation-region",
      "reference-answer:501",
    );
    expect(screen.getByRole("link", { name: "← 返回写作模块" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "收藏题目" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "收藏 Mustertext" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(document.querySelector(".writing-detail-actions__meta").closest("[data-exam-annotation-region]")).toBeNull();
    expect(document.querySelector(".writing-detail-review-card--user p").closest("[data-exam-annotation-region]")).toBeNull();
    const checkedTime = screen.getByRole("button", { name: /用时/ }).textContent;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("button", { name: /用时/ })).toHaveTextContent(checkedTime);

    const resetButton = screen.getByRole("button", { name: "Wiederholen" });
    expect(resetButton.closest("[data-exam-annotation-region]")).toBeNull();
    fireEvent.click(resetButton);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: /开始计时：30:00/ })).toBeInTheDocument();
    expect(sessionStorage.getItem(scope)).toBeNull();
    expect(sessionStorage.getItem(unrelatedScope)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /开始计时：30:00/ }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("button", { name: /计时中：29:59/ })).toBeInTheDocument();
  });

  it("keeps B1 sample and Chinese translations visible before and after checking, while Wiederholen clears the draft", async () => {
    fetchWritingExerciseDetail.mockResolvedValue({
      id: 41,
      exercise_base: { external_id: "41", level: "B1", exam_type: "TELC", exercise_type: "WRITING" },
      request_text: "Schreiben Sie eine E-Mail.",
      task_text: "Nennen Sie einen Grund.",
      time_limit_minutes: 30,
      words_limit: 80,
      content: {
        request_translation_zh: "请写一封电子邮件。",
        task_translation_zh: "请说明一个理由。",
      },
      example_texts: [{ id: 501, example_text: "Liebe Anna, ich kann leider nicht kommen.", translation_zh: "亲爱的安娜，很遗憾我不能来。" }],
    });
    renderPage();

    expect(await screen.findByText("请写一封电子邮件。")).toBeInTheDocument();
    expect(screen.getByText("请说明一个理由。")).toBeInTheDocument();
    expect(screen.getByText("Liebe Anna, ich kann leider nicht kommen.")).toBeInTheDocument();
    expect(screen.getByText("亲爱的安娜，很遗憾我不能来。")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Liebe Anna" } });
    fireEvent.click(screen.getByRole("button", { name: "Prüfen" }));
    expect(screen.getByRole("textbox")).toHaveValue("Liebe Anna");
    fireEvent.click(screen.getByRole("button", { name: "Wiederholen" }));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByText("亲爱的安娜，很遗憾我不能来。")).toBeInTheDocument();
  });

  it("keeps the existing guide interactive without registering its controls", async () => {
    useAuth.mockReturnValue({
      user: { id: 7, has_seen_schreiben_guide: false },
      reloadMe: vi.fn(),
    });
    renderPage();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跳过引导" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "上一步" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByRole("button", { name: "下一步" }).closest("[data-exam-annotation-region]")).toBeNull();
    expect(screen.getByText("先阅读题目内容").closest("[data-exam-annotation-region]")).toBeNull();
    expect(document.body).not.toHaveTextContent("Anleitung");
    expect(screen.queryByRole("heading", { name: /^(Anleitung|Aufgabe)$/ })).not.toBeInTheDocument();
    expect(document.querySelector(".writing-detail-shell")).toBeInTheDocument();
    expect(writingStyles).toMatch(/\.writing-detail-shell\s*\{(?=[^}]*width:\s*100%)[^}]*\}/s);
    expect(screen.getByRole("dialog")).toHaveClass("writing-detail-guide-card--right");

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("需要时开始计时")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一步" }).closest("[data-exam-annotation-region]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("在 Meine Antwort 中作答")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveClass("writing-detail-guide-card--left");
    expect(writingStyles).toMatch(/\.writing-detail-guide-card--left\s*\{[^}]*left:\s*1rem[^}]*right:\s*auto/s);
  });
});
