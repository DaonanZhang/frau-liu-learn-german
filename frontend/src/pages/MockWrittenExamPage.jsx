import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { confirmMockExamAction } from "../utils/confirmMockExamAction.js";
import { moveClozeMatchingOption } from "../utils/moveClozeMatchingOption.js";
import {
  createMockExam,
  fetchSavedMockExam,
  mockExamSessionKey,
  activeMockExamKey,
  saveMockExam,
  submitSavedMockExam,
  updateSavedMockExam,
} from "../api/exam_preparation/mockExams.js";
import { useAuth } from "../api/auth/useAuth.js";
import MockExamAnswerSheet from "../components/examPreparation/MockExamAnswerSheet.jsx";
import ExerciseOptionSheet from "../components/examPreparation/ExerciseOptionSheet.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import FormattedExplanation from "../components/examPreparation/FormattedExplanation.jsx";
import ListeningTranscript from "../components/examPreparation/ListeningTranscript.jsx";
import ReadingAdMatchingWorkspace from "../components/examPreparation/ReadingAdMatchingWorkspace.jsx";
import ScopedExplanation from "../components/examPreparation/ScopedExplanation.jsx";
import { hasScopedExplanation } from "../components/examPreparation/explanationVisibility.js";
import {
  fetchClozeChoiceBlankStates,
  fetchClozeMatchingBlankStates,
  fetchListeningQuestionStates,
  fetchReadingAdMatchingItemStates,
  fetchReadingTitleMatchingItemStates,
  fetchReadingUnderstandingQuestionStates,
  fetchWritingExerciseStates,
  saveClozeChoiceBlankState,
  saveClozeMatchingBlankState,
  saveListeningQuestionState,
  saveReadingAdMatchingItemState,
  saveReadingTitleMatchingItemState,
  saveReadingUnderstandingQuestionState,
  saveWritingExerciseState,
} from "../api/exam_preparation/userExerciseStates.js";
import "./MockWrittenExamPage.css";
import "./ReadingAdMatchingPage.css";

const READING_SECONDS = 90 * 60;
const LISTENING_SECONDS = 30 * 60;
const WRITING_SECONDS = 30 * 60;
const COLLECTION_SECONDS = 60;

const PARTS = {
  reading_title_matching: { section: "reading", short: "L 1", title: "Lesen · Teil 1" },
  reading_understanding: { section: "reading", short: "L 2", title: "Lesen · Teil 2" },
  reading_ad_matching: { section: "reading", short: "L 3", title: "Lesen · Teil 3" },
  cloze_choice: { section: "reading", short: "SB 1", title: "Sprachbausteine · Teil 1" },
  cloze_matching: { section: "reading", short: "SB 2", title: "Sprachbausteine · Teil 2" },
  listening_teil1: { section: "listening", short: "H 1", title: "Hören · Teil 1" },
  listening_teil2: { section: "listening", short: "H 2", title: "Hören · Teil 2" },
  listening_teil3: { section: "listening", short: "H 3", title: "Hören · Teil 3" },
  writing: { section: "writing", short: "Schr.", title: "Schreiben" },
};

const INTRODUCTION_BY_PART = {
  reading_title_matching: "Lesen Sie die Überschriften und die Texte. Finden Sie für jeden Text die passende Überschrift. Sie können jede Überschrift nur einmal benutzen.",
  reading_understanding: "Lesen Sie den Text und die Aufgaben. Welche Lösung (a, b oder c) ist jeweils richtig?",
  reading_ad_matching: "Lesen sie die Situationen 1-10 und die Anzeigen a-l. Finden sie für jede die passende Anzeige. Sie können jede Anzeige nur einmal benutzen. Markieren sie Ihre Lösungen für die Aufgaben 1–10 auf dem Antwortbogen. Wenn Sie zu einer Situation keine Anzeige finden, markieren Sie x.",
  cloze_choice: "Lesen Sie den Text und schließen Sie die Lücken. Welche Lösung ist jeweils richtig?",
  cloze_matching: "Lesen Sie den folgenden Text. Welcher Ausdruck passt am besten in die Lücken?",
  listening_teil1: "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1 - 5 richtig oder falsch sind. Lesen Sie jetzt die Aufgaben 1 - 5. Sie haben dazu 30 Sekunden Zeit.",
  listening_teil2: "Sie hören nun ein Gespräch. Dazu sollen Sie 10 Aufgaben lösen. Sie hören das Gespräch zweimal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
  listening_teil3: "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
};

const READING_PART_KEYS = Object.keys(PARTS).filter((key) => PARTS[key].section === "reading");
const LISTENING_PART_KEYS = Object.keys(PARTS).filter((key) => PARTS[key].section === "listening");
const ALL_REVIEW_PART_KEYS = [...READING_PART_KEYS, ...LISTENING_PART_KEYS, "writing"];
const REVIEW_NAVIGATION_PART_KEYS = [...READING_PART_KEYS, ...LISTENING_PART_KEYS];
const AUDIO_SEQUENCE = [
  { kind: "audio", partKey: "listening_teil1", playbackLabel: "einmal" },
  { kind: "break", next: "Hören · Teil 2" },
  { kind: "audio", partKey: "listening_teil2", playbackLabel: "zweimal" },
  { kind: "break", next: "Hören · Teil 3" },
  { kind: "audio", partKey: "listening_teil3", playbackLabel: "einmal" },
];

const WRITING_GRADE_POINTS = { A: 5, B: 3, C: 1, D: 0 };
const EMPTY_WRITING_ASSESSMENT = {
  topic_relevant: null,
  task_completion: "",
  communicative_design: "",
  formal_accuracy: "",
};
const EARLY_SUBMISSION_WRITING_ASSESSMENT = {
  topic_relevant: true,
  task_completion: "D",
  communicative_design: "D",
  formal_accuracy: "D",
};
const WRITING_CRITERIA = [
  {
    key: "task_completion",
    title: "I · Aufgabenbewältigung（任务完成度）",
    options: {
      A: "4 个要点均得到合理且充分的处理。",
      B: "3 个要点得到合理处理。",
      C: "2 个要点得到合理处理。",
      D: "仅处理了 1 个要点，或没有处理任何要点。",
    },
  },
  {
    key: "communicative_design",
    title: "II · Kommunikative Gestaltung（交际构思与语篇表达）",
    options: {
      A: "词汇充足，能够表达较复杂的内容，并使用多种连接方式组织句子。",
      B: "能够围绕熟悉话题连贯表达，并使用基础连接词组织段落。",
      C: "主要使用简单词汇和短句，连接方式较单一。",
      D: "主要由套话、零散单词或短语组成，无法形成连贯表达。",
    },
  },
  {
    key: "formal_accuracy",
    title: "III · Formale Richtigkeit（形式正确性）",
    options: {
      A: "有少量错误，但不影响理解；拼写和标点基本准确。",
      B: "有较明显的语法错误，但全文仍容易理解。",
      C: "基础错误较多，理解部分内容时需要推测。",
      D: "语法结构混乱，全文大部分内容无法理解。",
    },
  },
];

const PART_FAVORITE_CONFIG = {
  reading_title_matching: { fetch: fetchReadingTitleMatchingItemStates, save: saveReadingTitleMatchingItemState, target: "item", items: (exercise) => exercise.items || [] },
  reading_understanding: { fetch: fetchReadingUnderstandingQuestionStates, save: saveReadingUnderstandingQuestionState, target: "question", items: (exercise) => exercise.questions || [] },
  reading_ad_matching: { fetch: fetchReadingAdMatchingItemStates, save: saveReadingAdMatchingItemState, target: "item", items: (exercise) => exercise.items || [] },
  cloze_choice: { fetch: fetchClozeChoiceBlankStates, save: saveClozeChoiceBlankState, target: "blank", items: (exercise) => exercise.blanks || [] },
  cloze_matching: { fetch: fetchClozeMatchingBlankStates, save: saveClozeMatchingBlankState, target: "blank", items: (exercise) => exercise.blank_answers || [] },
  listening_teil1: { fetch: fetchListeningQuestionStates, save: saveListeningQuestionState, target: "question", items: (exercise) => exercise.questions || [] },
  listening_teil2: { fetch: fetchListeningQuestionStates, save: saveListeningQuestionState, target: "question", items: (exercise) => exercise.questions || [] },
  listening_teil3: { fetch: fetchListeningQuestionStates, save: saveListeningQuestionState, target: "question", items: (exercise) => exercise.questions || [] },
  writing: { fetch: fetchWritingExerciseStates, save: saveWritingExerciseState, target: "exercise", items: (exercise) => [exercise] },
};

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeWritingAssessment(value, legacyGrade = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...EMPTY_WRITING_ASSESSMENT, ...value };
  }
  if (WRITING_GRADE_POINTS[legacyGrade] !== undefined) {
    return {
      topic_relevant: true,
      task_completion: legacyGrade,
      communicative_design: legacyGrade,
      formal_accuracy: legacyGrade,
    };
  }
  return { ...EMPTY_WRITING_ASSESSMENT };
}

function isWritingAssessmentComplete(assessment) {
  if (assessment.topic_relevant === false) return true;
  return assessment.topic_relevant === true
    && WRITING_CRITERIA.every(({ key }) => WRITING_GRADE_POINTS[assessment[key]] !== undefined);
}

function writingAssessmentScore(assessment) {
  if (assessment.topic_relevant !== true) return 0;
  return WRITING_CRITERIA.reduce((total, { key }) => total + (WRITING_GRADE_POINTS[assessment[key]] || 0), 0) * 3;
}

function answerKey(partKey, id) {
  return `${partKey}:${id}`;
}

function displayQuestionNumber(questionNumbers, partKey, id, fallback) {
  return questionNumbers[answerKey(partKey, id)] ?? fallback;
}

function listeningIntroduction(partKey, exercise, questionNumbers, fallback) {
  if (!partKey.startsWith("listening_")) return fallback;
  const numbers = (exercise.questions || [])
    .map((question) => questionNumbers[answerKey(partKey, question.id)])
    .filter((number) => Number.isFinite(number));
  if (!numbers.length) return fallback;

  const range = `${Math.min(...numbers)}–${Math.max(...numbers)}`;
  if (/\b\d+\s*[-–]\s*\d+\b/.test(fallback)) {
    return fallback.replace(/\b\d+\s*[-–]\s*\d+\b/g, range);
  }
  return `${fallback} Bearbeiten Sie die Aufgaben ${range}.`.trim();
}

function itemCorrectKey(partKey, item) {
  if (partKey === "reading_title_matching" || partKey === "cloze_matching") return item.correct_option?.option_key;
  if (partKey === "reading_ad_matching") return item.correct_ad?.ad_key;
  if (partKey === "reading_understanding" || partKey.startsWith("listening_")) {
    return item.answer_options?.find((option) => option.is_correct)?.option_key;
  }
  if (partKey === "cloze_choice") return item.options?.find((option) => option.is_correct)?.option_key;
  return null;
}

function textBlocks(text) {
  return String(text || "").split(/<br\s*\/?>|\r?\n/gi).map((line, index) => (
    <span key={`${index}-${line}`}>
      {index ? <br /> : null}{line}
    </span>
  ));
}

function ChoiceField({
  value,
  options,
  onChange,
  disabled,
  review,
  correctKey,
  label,
  variant = "reading",
  feedbackVariant = variant,
  explanation = "",
  explanationScope = "question",
  favorite,
}) {
  const isCorrect = review && value && value === correctKey;
  const isWrong = review && value !== correctKey;
  const prefix = variant === "listening" ? "listening-exercise" : "reading-understanding";
  const feedbackPrefix = feedbackVariant === "listening"
    ? "listening-exercise"
    : feedbackVariant === "ad"
      ? "reading-ad"
      : "reading-understanding";
  const correctOption = options.find((option) => (option.option_key ?? option.ad_key) === correctKey);
  const correctText = correctOption?.option_text ?? correctOption?.ad_text_markdown ?? "";
  return (
    <article className={`${prefix}-question-card mock-exam-choice-field${isCorrect ? " is-correct" : ""}${isWrong ? " is-wrong" : ""}`}>
      {label ? <div className={`${prefix}-question-card__header`}><h3>{label}</h3>{favorite && !review ? <ExerciseFavoriteButton {...favorite} /> : null}</div> : null}
      <div className={`${prefix}-option-grid`}>
        {options.map((option) => {
          const optionKey = option.option_key ?? option.ad_key;
          const optionText = option.option_text ?? option.ad_text_markdown;
          const showCorrect = review && optionKey === correctKey;
          const showWrong = review && value === optionKey && optionKey !== correctKey;
          return (
            <label
              key={optionKey}
              className={`${prefix}-option${value === optionKey && !review ? ` ${prefix}-option--selected` : ""}${showCorrect ? ` ${prefix}-option--correct` : ""}${showWrong ? ` ${prefix}-option--wrong` : ""}`}
            >
              <input
                type="radio"
                name={label || correctKey}
                value={optionKey}
                checked={value === optionKey}
                onChange={() => onChange(optionKey)}
                disabled={disabled}
              />
              <span className={`${prefix}-option__key`}>{variant === "listening" ? textBlocks(optionText) : optionKey}</span>
              {variant !== "listening" ? <span className={`${prefix}-option__text`}>{textBlocks(optionText)}</span> : null}
            </label>
          );
        })}
      </div>
      {review ? (
        <div className={`${feedbackPrefix}-feedback ${feedbackPrefix}-feedback--${isCorrect ? "correct" : "wrong"}`}>
          <div className={`${feedbackPrefix}-feedback__header`}>
            <strong className={`${feedbackPrefix}-feedback__title`}>
              {isCorrect ? "Richtig" : value ? "Falsch" : "未作答"}
            </strong>
            {favorite ? <ExerciseFavoriteButton {...favorite} /> : null}
          </div>
          <p className={`${feedbackPrefix}-feedback__line`}>
            Richtige Antwort: {correctKey || "-"}{correctText ? ` - ${correctText}` : ""}
          </p>
          {hasScopedExplanation(explanation, options) ? (
            <p className={`${feedbackPrefix}-feedback__line`}>
              Erklärung: <ScopedExplanation
                explanation={explanation}
                explanationScope={explanationScope}
                options={options}
              />
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MatchingSelect({
  value,
  options,
  correctKey,
  onChange,
  disabled,
  review,
  variant = "cloze",
  title = "",
  placeholder = "请选择",
  explanation = "",
  explanationScope = "question",
  favorite,
}) {
  const [open, setOpen] = useState(false);
  const isCorrect = Boolean(value) && value === correctKey;
  const stateClass = review ? (isCorrect ? " is-correct" : " is-wrong") : "";
  const displayedValue = value;
  const selected = options.find((option) => option.option_key === displayedValue);
  const buttonClass = variant === "title"
    ? `reading-title-select reading-title-select-trigger${value && !review ? " reading-title-select--selected" : ""}${review && isCorrect ? " reading-title-select--correct" : ""}${review && !isCorrect ? " reading-title-select--wrong" : ""}`
    : `cloze-choice-slot-trigger${displayedValue ? " cloze-drop-slot__chip" : " cloze-choice-slot-trigger--empty"}${review && isCorrect ? " cloze-drop-slot__chip--correct" : ""}${review && !isCorrect ? " cloze-drop-slot__chip--wrong" : ""}`;
  return (
    <span className={`mock-exam-inline-answer${stateClass}`}>
      <button type="button" className={buttonClass} disabled={disabled} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open}>
        {selected && variant === "title" ? (
          <>
            <span className="reading-title-select__key">{selected.option_key}</span>
            <span className="reading-title-select__label">{selected.option_text}</span>
          </>
        ) : selected?.option_text || (variant === "title" ? "Überschrift auswählen" : placeholder)}
      </button>
      <ExerciseOptionSheet open={open} title={title || "请选择答案"} selectedValue={displayedValue || ""}
        options={options.map((option) => ({ value: option.option_key, label: option.option_text, meta: option.option_key }))}
        metaPlacement={variant === "title" ? "before" : "after"}
        onClose={() => setOpen(false)} onSelect={onChange} />
      {review && variant !== "title" ? (
        <span className="cloze-choice-inline-details">
          <span className="cloze-choice-inline-result">
            <span className={`cloze-inline-feedback ${isCorrect ? "cloze-inline-feedback--correct" : "cloze-inline-feedback--answer"}`}>
              {isCorrect ? "Richtig" : value ? `Richtig: ${options.find((option) => option.option_key === correctKey)?.option_text || correctKey || "-"}` : `未作答，Richtig: ${options.find((option) => option.option_key === correctKey)?.option_text || correctKey || "-"}`}
            </span>
            {favorite ? <ExerciseFavoriteButton {...favorite} /> : null}
          </span>
          {hasScopedExplanation(explanation, options) ? (
            <span className="cloze-choice-inline-explanation">
              Erklärung: <ScopedExplanation
                explanation={explanation}
                explanationScope={explanationScope}
                options={options}
              />
            </span>
          ) : null}
        </span>
      ) : favorite && !review ? <ExerciseFavoriteButton {...favorite} /> : null}
    </span>
  );
}

function ClozeChoiceText({ content, blanks, optionsForBlank, partKey, answers, setAnswer, disabled, review, favoriteFor, questionNumbers }) {
  const blankMap = Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank]));
  return String(content || "")
    .split(/(\{\{blank_\d+\}\})/g)
    .filter(Boolean)
    .map((part, index) => {
      if (!/^\{\{blank_\d+\}\}$/.test(part)) {
        return <span key={`${index}-${part}`}>{textBlocks(part)}</span>;
      }
      const blank = blankMap[part.replace(/[{}]/g, "")];
      if (!blank) return <span key={part}>{part}</span>;
      const key = answerKey(partKey, blank.id);
      const displayNumber = displayQuestionNumber(questionNumbers, partKey, blank.id, blank.blank_number || blank.blank_key || "");
      return (
        <MatchingSelect
          key={key}
          value={answers[key]}
          options={optionsForBlank(blank)}
          correctKey={blank.correct_option?.option_key || blank.options?.find((option) => option.is_correct)?.option_key}
          onChange={(value) => setAnswer(key, value)}
          disabled={disabled}
          review={review}
          title={`空格 ${displayNumber}`}
          placeholder={String(displayNumber)}
          explanation={blank.explanation}
          explanationScope={blank.explanation_scope}
          favorite={review ? favoriteFor(blank.id) : null}
        />
      );
    });
}

function MockClozeMatching({ exercise, answers, setAnswers, partKey, disabled, review, favoriteFor, questionNumbers }) {
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const blanks = exercise.blank_answers || [];
  const options = exercise.options || [];
  const blankMap = Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank]));
  const optionMap = Object.fromEntries(options.map((option) => [option.option_key, option]));
  const blankKeys = blanks.map((blank) => answerKey(partKey, blank.id));
  const usedOptionKeys = new Set(blankKeys.map((key) => answers[key]).filter(Boolean));
  const poolOptions = options.filter((option) => !usedOptionKeys.has(option.option_key));

  function assignOption(blank, optionKey) {
    if (disabled) return;
    setAnswers((previous) => moveClozeMatchingOption(
      previous,
      blankKeys,
      answerKey(partKey, blank.id),
      optionKey,
    ));
    setSelectedOptionKey("");
  }

  return (
    <>
      {!review ? (
        <section className="mock-cloze-matching-pool mock-cloze-matching-pool--sticky" aria-label="选项区">
          <div className="mock-cloze-matching-pool__heading"><strong>选项区</strong><span>拖动或选择一个选项后点击对应空格</span></div>
          <div className="mock-cloze-matching-pool__options">
            {poolOptions.map((option) => (
              <button
                key={option.option_key}
                type="button"
                draggable
                className={`mock-cloze-matching-pool__option${selectedOptionKey === option.option_key ? " is-selected" : ""}`}
                onClick={() => setSelectedOptionKey((previous) => previous === option.option_key ? "" : option.option_key)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", option.option_key);
                  setSelectedOptionKey(option.option_key);
                }}
              >
                {option.option_text}
              </button>
            ))}
            {!poolOptions.length ? <span className="mock-cloze-matching-pool__empty">所有选项均已填入空格。</span> : null}
          </div>
        </section>
      ) : null}
      <div className="mock-exam-source-text mock-cloze-matching-text mock-cloze-matching-text--compact">
        {String(exercise.content_with_placeholders || "")
          .split(/(\{\{blank_\d+\}\})/g)
          .filter(Boolean)
          .map((part, index) => {
            if (!/^\{\{blank_\d+\}\}$/.test(part)) {
              return <span key={`${index}-${part}`}>{textBlocks(part)}</span>;
            }
            const blank = blankMap[part.replace(/[{}]/g, "")];
            if (!blank) return <span key={part}>{part}</span>;
            const key = answerKey(partKey, blank.id);
            const selectedKey = answers[key] || "";
            const correctKey = blank.correct_option?.option_key || "";
            const displayNumber = displayQuestionNumber(questionNumbers, partKey, blank.id, blank.blank_number || "");
            const isCorrect = review && selectedKey === correctKey;
            const isWrong = review && selectedKey !== correctKey;
            return (
              <span key={key} className="mock-cloze-matching-blank">
                <span
                  className={`mock-cloze-matching-slot${selectedOptionKey ? " is-ready" : ""}${isCorrect ? " is-correct" : ""}${isWrong ? " is-wrong" : ""}`}
                  onClick={() => {
                    if (selectedOptionKey) assignOption(blank, selectedOptionKey);
                    else if (selectedKey) assignOption(blank, "");
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    assignOption(blank, event.dataTransfer.getData("text/plain") || selectedOptionKey);
                  }}
                >
                  {selectedKey ? <span className="mock-cloze-matching-slot__chip">{optionMap[selectedKey]?.option_text || selectedKey}</span> : <span>{displayNumber}</span>}
                </span>
                {review && isWrong ? <small>正确答案：{optionMap[correctKey]?.option_text || correctKey || "—"}</small> : null}
              </span>
            );
          })}
      </div>
      {review ? (
        <section className="cloze-feedback-list">
          {blanks.map((blank) => {
            const selectedKey = answers[answerKey(partKey, blank.id)] || "";
            const selectedOption = optionMap[selectedKey];
            const correctOption = blank.correct_option;
            const displayNumber = displayQuestionNumber(questionNumbers, partKey, blank.id, blank.blank_number || "");
            const isCorrect = Boolean(selectedKey) && selectedKey === correctOption?.option_key;
            return (
              <article
                key={blank.id}
                className={`cloze-feedback-card ${isCorrect ? "cloze-feedback-card--correct" : "cloze-feedback-card--wrong"}`}
              >
                <div className="cloze-feedback-card__header">
                  <strong>{displayNumber}</strong>
                  <ExerciseFavoriteButton {...favoriteFor(blank.id)} />
                </div>
                <p>Ihre Antwort: {selectedOption?.option_text || "-"}</p>
                <p>Richtige Antwort: {correctOption?.option_text || correctOption?.option_key || "-"}</p>
                {String(blank.explanation || "").trim() ? (
                  <p>Erklärung: <FormattedExplanation text={blank.explanation} /></p>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </>
  );
}

function ExercisePart({ partKey, exercise, answers, setAnswer, setAnswers, disabled = false, review = false, writingText, setWritingText, favoriteFor, questionNumbers, sectionRef }) {
  if (!exercise) return <p>该部分题目加载失败。</p>;
  const heading = exercise.exercise_base?.title || PARTS[partKey].title;
  const baseIntroduction = String(exercise.instruction || INTRODUCTION_BY_PART[partKey] || "").trim();
  const introduction = listeningIntroduction(partKey, exercise, questionNumbers, baseIntroduction);

  let body = null;
  if (partKey === "reading_title_matching") {
    body = (
      <>
        <div className="reading-title-text-grid">{(exercise.items || []).map((item) => {
          const key = answerKey(partKey, item.id);
          const displayNumber = displayQuestionNumber(questionNumbers, partKey, item.id, item.item_number);
          return <article key={key} className="reading-title-text-card">
            <div className="reading-title-text-card__topline">
              <div className="reading-title-text-card__badge">Text {displayNumber}</div>
                <MatchingSelect value={answers[key] || ""} options={exercise.options || []}
                correctKey={item.correct_option?.option_key} onChange={(value) => setAnswer(key, value)}
                disabled={disabled} review={review} variant="title" title={`Text ${displayNumber}`} />
            </div>
            <div>{textBlocks(item.text)}</div>
            {review ? (
              <div className={`reading-title-feedback ${answers[key] === item.correct_option?.option_key ? "reading-title-feedback--correct" : "reading-title-feedback--wrong"}`}>
                <div className="reading-title-feedback__header">
                  <strong className="reading-title-feedback__title">
                    {answers[key] === item.correct_option?.option_key ? "Richtig" : answers[key] ? "Falsch" : "未作答"}
                  </strong>
                  <ExerciseFavoriteButton {...favoriteFor(partKey, item.id)} />
                </div>
                <p className="reading-title-feedback__line">
                  Richtige Antwort: {item.correct_option?.option_key || "-"} - {item.correct_option?.option_text || "-"}
                </p>
                {String(item.explanation || "").trim() ? (
                  <p className="reading-title-feedback__line">
                    Erklärung: <FormattedExplanation text={item.explanation} />
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>;
        })}</div>
      </>
    );
  } else if (partKey === "reading_understanding") {
    body = (
      <>
        <div className="mock-exam-source-text">{textBlocks(exercise.text_markdown)}</div>
        {(exercise.questions || []).map((question) => {
          const key = answerKey(partKey, question.id);
          const displayNumber = displayQuestionNumber(questionNumbers, partKey, question.id, question.question_number);
          const correct = (question.answer_options || []).find((option) => option.is_correct)?.option_key;
          return <ChoiceField key={key} label={`${displayNumber}. ${question.question_text}`}
            value={answers[key] || ""} options={question.answer_options || []} correctKey={correct}
            onChange={(value) => setAnswer(key, value)} disabled={disabled} review={review} variant="reading"
            explanation={question.explanation} explanationScope={question.explanation_scope}
            favorite={review ? favoriteFor(partKey, question.id) : null} />;
        })}
      </>
    );
  } else if (partKey === "reading_ad_matching") {
    const adAnswers = Object.fromEntries((exercise.items || []).map((item) => [
      item.id,
      answers[answerKey(partKey, item.id)] || "",
    ]));
    const numberedExercise = {
      ...exercise,
      items: (exercise.items || []).map((item) => ({
        ...item,
        item_number: displayQuestionNumber(questionNumbers, partKey, item.id, item.item_number),
      })),
    };
    body = <>
      <ReadingAdMatchingWorkspace
        key={exercise.id}
        exercise={numberedExercise}
        answers={adAnswers}
        review={review}
        onAnswer={(itemId, value) => setAnswer(answerKey(partKey, itemId), value)}
        favoriteFor={review ? (item) => favoriteFor(partKey, item.id) : null}
      />
    </>;
  } else if (partKey === "cloze_choice") {
    body = <div className="mock-exam-source-text"><ClozeChoiceText content={exercise.content_with_placeholders}
      blanks={exercise.blanks || []} optionsForBlank={(blank) => blank.options || []} partKey={partKey}
      answers={answers} setAnswer={setAnswer} disabled={disabled} review={review}
      favoriteFor={(id) => favoriteFor(partKey, id)} questionNumbers={questionNumbers} /></div>;
  } else if (partKey === "cloze_matching") {
    body = <MockClozeMatching exercise={exercise} answers={answers} setAnswers={setAnswers} partKey={partKey}
      disabled={disabled} review={review} favoriteFor={(id) => favoriteFor(partKey, id)} questionNumbers={questionNumbers} />;
  } else if (partKey.startsWith("listening_")) {
    body = (exercise.questions || []).map((question) => {
      const key = answerKey(partKey, question.id);
      const displayNumber = displayQuestionNumber(questionNumbers, partKey, question.id, question.question_number);
      const correct = (question.answer_options || []).find((option) => option.is_correct)?.option_key;
      return <ChoiceField key={key} label={`${displayNumber}. ${question.question_text}`}
        value={answers[key] || ""} options={question.answer_options || []} correctKey={correct}
        onChange={(value) => setAnswer(key, value)} disabled={disabled} review={review} variant="listening"
        explanation={question.explanation} explanationScope={question.explanation_scope}
        favorite={review ? favoriteFor(partKey, question.id) : null} />;
    });
  } else if (partKey === "writing") {
    body = (
      <div className="mock-exam-writing-grid">
        <div className="mock-exam-source-text">
          <h3>Anleitung</h3>
          <p>{textBlocks(exercise.request_text)}</p>
          <h3>Aufgabe</h3>
          <p>{textBlocks(exercise.task_text)}</p>
        </div>
        <label className="mock-exam-writing-field">
          <span>Meine Antwort {review ? <ExerciseFavoriteButton {...favoriteFor(partKey, exercise.id)} /> : null}</span>
          <textarea value={writingText} onChange={(event) => setWritingText(event.target.value)} disabled={disabled}
            placeholder="Schreiben Sie hier Ihre Antwort …" />
          <small>{String(writingText || "").trim().split(/\s+/).filter(Boolean).length} Wörter</small>
        </label>
      </div>
    );
  }

  return (
    <section ref={sectionRef} className="mock-exam-paper">
      <div className="mock-exam-paper__heading">
        <div><span>{PARTS[partKey].title}</span><h2>{heading}</h2></div>
        <span className="mock-exam-paper__badge">{exercise.exercise_base?.exam_type || "telc B1"}</span>
      </div>
      {introduction ? (
        <section className="mock-exam-introduction">
          <span className="mock-exam-introduction__label">Einleitung</span>
          <p>{textBlocks(introduction)}</p>
        </section>
      ) : null}
      {partKey.startsWith("listening_") && review ? (
        <ListeningTranscript script={exercise.script} />
      ) : null}
      {body}
    </section>
  );
}

function correctCount(parts, answers, partKeys) {
  let correct = 0;
  partKeys.forEach((partKey) => {
    const exercise = parts[partKey] || {};
    if (partKey === "reading_title_matching") {
      (exercise.items || []).forEach((item) => { correct += answers[answerKey(partKey, item.id)] === item.correct_option?.option_key ? 1 : 0; });
    } else if (partKey === "reading_understanding" || partKey.startsWith("listening_")) {
      (exercise.questions || []).forEach((question) => {
        const selected = (question.answer_options || []).find((option) => option.option_key === answers[answerKey(partKey, question.id)]);
        correct += selected?.is_correct ? 1 : 0;
      });
    } else if (partKey === "reading_ad_matching") {
      (exercise.items || []).forEach((item) => { correct += answers[answerKey(partKey, item.id)] === item.correct_ad?.ad_key ? 1 : 0; });
    } else if (partKey === "cloze_choice") {
      (exercise.blanks || []).forEach((blank) => {
        const selected = (blank.options || []).find((option) => option.option_key === answers[answerKey(partKey, blank.id)]);
        correct += selected?.is_correct ? 1 : 0;
      });
    } else if (partKey === "cloze_matching") {
      (exercise.blank_answers || []).forEach((blank) => { correct += answers[answerKey(partKey, blank.id)] === blank.correct_option?.option_key ? 1 : 0; });
    }
  });
  return correct;
}

function buildAnswerSheetRows(parts) {
  if (!parts) return [];
  const rows = [];
  let number = 1;
  const add = (partKey, partLabel, group, items, options, correctKey) => {
    items.forEach((item) => {
      const itemOptions = typeof options === "function" ? options(item) : options;
      rows.push({
        answerKey: answerKey(partKey, item.id),
        partKey,
        partLabel,
        group,
        number,
        options: (itemOptions || []).map((option) => ({
          optionKey: option.option_key ?? option.ad_key,
          optionText: option.option_text ?? option.ad_text_markdown ?? "",
        })),
        optionKeys: (itemOptions || []).map((option) => option.option_key ?? option.ad_key),
        correctKey: correctKey(item),
      });
      number += 1;
    });
  };

  const titleMatching = parts.reading_title_matching || {};
  add("reading_title_matching", "Lesen · Teil 1", "reading", titleMatching.items || [],
    titleMatching.options || [], (item) => item.correct_option?.option_key);
  const understanding = parts.reading_understanding || {};
  add("reading_understanding", "Lesen · Teil 2", "reading", understanding.questions || [],
    (item) => item.answer_options || [], (item) => item.answer_options?.find((option) => option.is_correct)?.option_key);
  const adMatching = parts.reading_ad_matching || {};
  add("reading_ad_matching", "Lesen · Teil 3", "reading", adMatching.items || [],
    adMatching.ads || [], (item) => item.correct_ad?.ad_key);
  const clozeChoice = parts.cloze_choice || {};
  add("cloze_choice", "Sprachbausteine · Teil 1", "reading", clozeChoice.blanks || [],
    (item) => item.options || [], (item) => item.options?.find((option) => option.is_correct)?.option_key);
  const clozeMatching = parts.cloze_matching || {};
  add("cloze_matching", "Sprachbausteine · Teil 2", "reading", clozeMatching.blank_answers || [],
    clozeMatching.options || [], (item) => item.correct_option?.option_key);
  LISTENING_PART_KEYS.forEach((partKey, index) => {
    const listening = parts[partKey] || {};
    add(partKey, `Hören · Teil ${index + 1}`, "listening", listening.questions || [],
      (item) => item.answer_options || [], (item) => item.answer_options?.find((option) => option.is_correct)?.option_key);
  });
  return rows;
}

export default function MockWrittenExamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const sessionKey = mockExamSessionKey(user?.id);
  const activeAttemptKey = activeMockExamKey(user?.id);
  const [searchParams] = useSearchParams();
  const savedExamParam = searchParams.get("saved") || "";
  const attemptParam = searchParams.get("attempt") || "";
  const audioRef = useRef(null);
  const exercisePartRef = useRef(null);
  const teil2CompletedPlaysRef = useRef(0);
  const createRequestIdRef = useRef(createRequestId());
  const submissionStartedRef = useRef(false);
  const [exam, setExam] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [activePart, setActivePart] = useState(READING_PART_KEYS[0]);
  const [answers, setAnswers] = useState({});
  const [writingText, setWritingText] = useState("");
  const [writingAssessment, setWritingAssessment] = useState(() => ({ ...EMPTY_WRITING_ASSESSMENT }));
  const [audioStep, setAudioStep] = useState(0);
  const [audioStepStartedAt, setAudioStepStartedAt] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [attemptId, setAttemptId] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSavedReview, setIsSavedReview] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [questionFavorites, setQuestionFavorites] = useState({});
  const [questionFavoritePending, setQuestionFavoritePending] = useState({});
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [wasEarlySubmitted, setWasEarlySubmitted] = useState(false);

  const persist = useCallback((next = {}) => {
    const snapshot = { exam, phase, deadline, activePart, answers, writingText, writingAssessment, audioStep, audioStepStartedAt, attemptId, isFavorite, wasEarlySubmitted, ...next };
    if (snapshot.exam) {
      const serialized = JSON.stringify(snapshot);
      sessionStorage.setItem(sessionKey, serialized);
      localStorage.setItem(sessionKey, serialized);
    }
  }, [exam, phase, deadline, activePart, answers, writingText, writingAssessment, audioStep, audioStepStartedAt, attemptId, isFavorite, wasEarlySubmitted, sessionKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (savedExamParam) {
        try {
          setPhase("loading"); setErrorText("");
          const saved = await fetchSavedMockExam(savedExamParam);
          if (cancelled) return;
          setExam(saved.exam); setAnswers(saved.answers || {}); setWritingText(saved.writing_text || "");
          setWritingAssessment(normalizeWritingAssessment(saved.writing_assessment, saved.writing_grade));
          setAttemptId(saved.id); setIsFavorite(saved.is_favorite); setIsSavedReview(true);
          setWasEarlySubmitted(!!saved.progress?.early_submitted);
          setPhase("results"); setDeadline(0); setActivePart(READING_PART_KEYS[0]); setNow(Date.now());
          return;
        } catch (error) {
          if (!cancelled) {
            setPhase("error");
            setErrorText(error?.data?.message || "收藏卷加载失败或其中的题目已不存在。");
          }
          return;
        }
      }
      if (attemptParam) {
        try {
          setPhase("loading"); setErrorText("");
          const saved = await fetchSavedMockExam(attemptParam);
          if (cancelled) return;
          const progress = saved.progress || {};
          setExam(saved.exam); setAnswers(saved.answers || {}); setWritingText(saved.writing_text || "");
          setWritingAssessment(normalizeWritingAssessment(saved.writing_assessment, saved.writing_grade));
          setAttemptId(saved.id); setIsFavorite(!!saved.is_favorite);
          setPhase(progress.phase || "reading"); setDeadline(Number(progress.deadline) || Date.now());
          setActivePart(progress.active_part || READING_PART_KEYS[0]); setAudioStep(Number(progress.audio_step) || 0);
          setAudioStepStartedAt(Number(progress.audio_step_started_at) || Date.now()); setNow(Date.now());
          setWasEarlySubmitted(!!progress.early_submitted);
          setIsSavedReview(false); localStorage.setItem(activeAttemptKey, String(saved.id));
          return;
        } catch (error) {
          if (!cancelled) {
            setPhase("error");
            setErrorText(error?.data?.message || "考试记录加载失败或其中的题目已不存在。");
          }
          return;
        }
      }
      const stored = sessionStorage.getItem(sessionKey) || localStorage.getItem(sessionKey);
      if (stored && loadKey === 0) {
        try {
          const restored = JSON.parse(stored);
          if (restored?.exam && restored?.phase) {
            setExam(restored.exam); setPhase(restored.phase); setDeadline(restored.deadline || 0);
            setNow(Date.now());
            setActivePart(restored.activePart || READING_PART_KEYS[0]); setAnswers(restored.answers || {});
            setWritingText(restored.writingText || "");
            setWritingAssessment(normalizeWritingAssessment(restored.writingAssessment, restored.writingGrade));
            setAudioStep(restored.audioStep || 0); setAudioStepStartedAt(restored.audioStepStartedAt || Date.now());
            setWasEarlySubmitted(!!restored.wasEarlySubmitted);
            setAttemptId(restored.attemptId || restored.savedExamId || null); setIsFavorite(!!restored.isFavorite); setIsSavedReview(false);
            return;
          }
        } catch {
          sessionStorage.removeItem(sessionKey);
          localStorage.removeItem(sessionKey);
        }
      }
      const activeAttemptId = localStorage.getItem(activeAttemptKey);
      if (activeAttemptId && loadKey === 0) {
        try {
          const saved = await fetchSavedMockExam(activeAttemptId);
          if (cancelled) return;
          const progress = saved.progress || {};
          setExam(saved.exam); setAnswers(saved.answers || {}); setWritingText(saved.writing_text || "");
          setWritingAssessment(normalizeWritingAssessment(saved.writing_assessment, saved.writing_grade));
          setAttemptId(saved.id); setIsFavorite(!!saved.is_favorite);
          setPhase(progress.phase || "reading"); setDeadline(Number(progress.deadline) || Date.now());
          setActivePart(progress.active_part || READING_PART_KEYS[0]); setAudioStep(Number(progress.audio_step) || 0);
          setAudioStepStartedAt(Number(progress.audio_step_started_at) || Date.now()); setNow(Date.now());
          setWasEarlySubmitted(!!progress.early_submitted); setIsSavedReview(false);
          return;
        } catch {
          localStorage.removeItem(activeAttemptKey);
        }
      }
      try {
        setPhase("loading"); setErrorText("");
        const data = await createMockExam(createRequestIdRef.current);
        if (cancelled) return;
        const progress = data.progress || {};
        const nextDeadline = Number(progress.deadline) || Date.now() + READING_SECONDS * 1000;
        setNow(Date.now());
        setExam(data); setPhase("reading"); setDeadline(nextDeadline); setActivePart(READING_PART_KEYS[0]);
        setAnswers({}); setWritingText(""); setWritingAssessment({ ...EMPTY_WRITING_ASSESSMENT });
        setAudioStep(0); setAudioStepStartedAt(0); setWasEarlySubmitted(false);
        setAttemptId(data.attempt_id); setIsFavorite(false); setIsSavedReview(false); setFavoriteMessage("");
        localStorage.setItem(activeAttemptKey, String(data.attempt_id));
        const initialSnapshot = JSON.stringify({ exam: data, phase: "reading", deadline: nextDeadline,
          activePart: READING_PART_KEYS[0], answers: {}, writingText: "",
          writingAssessment: { ...EMPTY_WRITING_ASSESSMENT }, audioStep: 0,
          audioStepStartedAt: 0, attemptId: data.attempt_id, isFavorite: false, wasEarlySubmitted: false });
        sessionStorage.setItem(sessionKey, initialSnapshot);
        localStorage.setItem(sessionKey, initialSnapshot);
      } catch (error) {
        if (!cancelled) {
          setPhase("error");
          setErrorText(error?.status === 403 ? "笔试模拟仅对已购买备考季的用户开放。" : (error?.data?.message || "暂时无法生成模拟试卷。"));
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [loadKey, savedExamParam, attemptParam, sessionKey, activeAttemptKey]);

  useEffect(() => {
    if (["loading", "error", "results"].includes(phase)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!exam || isSavedReview) return;
    persist();
  }, [exam, phase, deadline, activePart, answers, writingText, writingAssessment, audioStep, audioStepStartedAt, attemptId, isFavorite, wasEarlySubmitted, isSavedReview, persist]);

  useEffect(() => {
    if (!attemptId || isSavedReview || submissionStartedRef.current) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        await updateSavedMockExam(attemptId, {
          answers,
          writing_text: writingText,
          writing_assessment: writingAssessment,
          is_favorite: isFavorite,
          progress: { phase, deadline, active_part: activePart, audio_step: audioStep, audio_step_started_at: audioStepStartedAt, early_submitted: wasEarlySubmitted },
        });
      } catch {
        if (!submissionStartedRef.current) {
          setFavoriteMessage("考试进度保存失败，请检查网络后继续");
        }
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [attemptId, isSavedReview, answers, writingText, writingAssessment, phase, deadline, activePart, audioStep, audioStepStartedAt, isFavorite, wasEarlySubmitted]);

  useEffect(() => {
    if (phase !== "results" || !exam?.parts) return undefined;
    let cancelled = false;
    Promise.all(Object.entries(PART_FAVORITE_CONFIG).map(async ([partKey, config]) => {
      const exercise = exam.parts[partKey];
      if (!exercise?.id) return [];
      const data = await config.fetch(exercise.id);
      return (data?.results || []).map((state) => [answerKey(partKey, state[config.target]), !!state.is_favorited]);
    })).then((groups) => {
      if (!cancelled) setQuestionFavorites(Object.fromEntries(groups.flat()));
    }).catch(() => {
      if (!cancelled) setFavoriteMessage("题目收藏状态加载失败，请稍后重试");
    });
    return () => { cancelled = true; };
  }, [phase, exam]);

  useEffect(() => {
    const active = !["loading", "error", "results", "writing_review"].includes(phase);
    if (!active) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const enterListening = useCallback(() => {
    const nextDeadline = Date.now() + LISTENING_SECONDS * 1000;
    const startedAt = Date.now();
    teil2CompletedPlaysRef.current = 0;
    setPhase("listening"); setDeadline(nextDeadline); setActivePart(LISTENING_PART_KEYS[0]);
    setAudioStep(0); setAudioStepStartedAt(startedAt); setNeedsAudioGesture(false);
    persist({ phase: "listening", deadline: nextDeadline, activePart: LISTENING_PART_KEYS[0], audioStep: 0, audioStepStartedAt: startedAt });
  }, [persist]);

  const enterWriting = useCallback(() => {
    const nextDeadline = Date.now() + WRITING_SECONDS * 1000;
    setPhase("writing"); setDeadline(nextDeadline); setActivePart("writing");
    audioRef.current?.pause();
    persist({ phase: "writing", deadline: nextDeadline, activePart: "writing" });
  }, [persist]);

  useEffect(() => {
    if (!deadline || !["reading", "collection", "listening", "writing"].includes(phase)) return undefined;
    const timer = window.setTimeout(() => {
      if (phase === "reading") {
        setPhase("collection"); setDeadline(Date.now() + COLLECTION_SECONDS * 1000);
      } else if (phase === "collection") {
        enterListening();
      } else if (phase === "listening") {
        enterWriting();
      } else if (phase === "writing") {
        setPhase("writing_review"); setDeadline(0);
      }
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deadline, phase, enterListening, enterWriting]);

  const currentAudioAction = AUDIO_SEQUENCE[audioStep] || null;
  const currentAudioExercise = currentAudioAction?.kind === "audio" ? exam?.parts?.[currentAudioAction.partKey] : null;

  const playCurrentAudio = useCallback(async () => {
    const element = audioRef.current;
    if (!element || !currentAudioExercise?.audio_file_url) return;
    try { await element.play(); setNeedsAudioGesture(false); }
    catch { setAudioPlaying(false); setNeedsAudioGesture(true); }
  }, [currentAudioExercise]);

  const advanceAudioStep = useCallback(() => {
    const nextStep = audioStep + 1;
    const startedAt = Date.now();
    setAudioStep(nextStep);
    setAudioStepStartedAt(startedAt);
    persist({ audioStep: nextStep, audioStepStartedAt: startedAt });
    if (attemptId && !isSavedReview) {
      updateSavedMockExam(attemptId, {
        answers,
        writing_text: writingText,
        writing_assessment: writingAssessment,
        is_favorite: isFavorite,
        progress: { phase, deadline, active_part: activePart, audio_step: nextStep, audio_step_started_at: startedAt },
      }).catch(() => setFavoriteMessage("听力播放进度保存失败，请检查网络"));
    }
  }, [audioStep, persist, attemptId, isSavedReview, answers, writingText, writingAssessment, isFavorite, phase, deadline, activePart]);

  const handleAudioEnded = useCallback(async (event) => {
    setAudioPlaying(false);
    if (currentAudioAction?.partKey === "listening_teil2" && teil2CompletedPlaysRef.current === 0) {
      teil2CompletedPlaysRef.current = 1;
      event.currentTarget.currentTime = 0;
      try {
        await event.currentTarget.play();
        setNeedsAudioGesture(false);
      } catch {
        setNeedsAudioGesture(true);
      }
      return;
    }

    teil2CompletedPlaysRef.current = 0;
    advanceAudioStep();
  }, [currentAudioAction, advanceAudioStep]);

  useEffect(() => {
    if (phase !== "listening" || !currentAudioAction) return undefined;
    if (currentAudioAction.kind === "audio") {
      const frame = window.requestAnimationFrame(() => {
        setActivePart(currentAudioAction.partKey);
        playCurrentAudio();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const remaining = Math.max(0, COLLECTION_SECONDS * 1000 - (Date.now() - audioStepStartedAt));
    const timer = window.setTimeout(advanceAudioStep, remaining);
    return () => window.clearTimeout(timer);
  }, [phase, currentAudioAction, audioStepStartedAt, playCurrentAudio, advanceAudioStep]);

  function setAnswer(key, value) { setAnswers((previous) => ({ ...previous, [key]: value })); }
  async function finishReadingEarly() {
    if (await confirmMockExamAction("结束阅读并进入听力部分", "进入后不能返回修改阅读答案。")) enterListening();
  }
  async function finishListeningEarly() {
    if (await confirmMockExamAction("结束听力并进入写作部分", "进入后不能返回修改听力答案。")) enterWriting();
  }
  async function submitWriting() {
    if (await confirmMockExamAction("提交写作", "提交后将展示范文并进行自评。")) {
      setPhase("writing_review");
      setDeadline(0);
    }
  }
  async function completeExam(finalWritingAssessment, earlySubmitted = false) {
    submissionStartedRef.current = true;
    audioRef.current?.pause();
    setNeedsAudioGesture(false);
    setWritingAssessment(finalWritingAssessment);
    setWasEarlySubmitted(earlySubmitted);
    setResultModalOpen(true);
    setPhase("results"); setDeadline(0); setActivePart(READING_PART_KEYS[0]);
    persist({
      phase: "results",
      deadline: 0,
      activePart: READING_PART_KEYS[0],
      writingAssessment: finalWritingAssessment,
      wasEarlySubmitted: earlySubmitted,
    });
    if (attemptId && !isSavedReview) {
      try {
        await submitSavedMockExam(attemptId, {
          answers, writing_text: writingText, writing_assessment: finalWritingAssessment,
          is_favorite: isFavorite,
          progress: { phase: "results", deadline: 0, active_part: READING_PART_KEYS[0], audio_step: audioStep, audio_step_started_at: audioStepStartedAt, early_submitted: earlySubmitted },
        });
        const completed = await fetchSavedMockExam(attemptId);
        if (completed?.is_completed && completed?.exam) {
          setExam(completed.exam);
          localStorage.removeItem(activeAttemptKey);
        }
      } catch {
        setFavoriteMessage("考试结果保存失败，请检查网络");
      }
    }
  }
  async function submitExamEarly() {
    if (!await confirmMockExamAction("提前交卷")) return;
    completeExam({ ...EARLY_SUBMISSION_WRITING_ASSESSMENT }, true);
  }
  async function finishSelfAssessment() {
    if (!isWritingAssessmentComplete(writingAssessment)) return;
    await completeExam(writingAssessment, false);
  }
  function newExam() {
    sessionStorage.removeItem(sessionKey); localStorage.removeItem(sessionKey); localStorage.removeItem(activeAttemptKey);
    setExam(null); setAttemptId(null); setIsFavorite(false); setIsSavedReview(false); setWasEarlySubmitted(false);
    createRequestIdRef.current = createRequestId();
    if (savedExamParam || attemptParam) navigate("/modules/exam-preparation/mock-exam", { replace: true });
    else setLoadKey((value) => value + 1);
  }

  async function toggleFavorite() {
    if (!exam || favoritePending || phase !== "results") return;
    setFavoritePending(true); setFavoriteMessage("");
    try {
      if (attemptId) {
        const nextFavorite = !isFavorite;
        await updateSavedMockExam(attemptId, { is_favorite: nextFavorite });
        setIsFavorite(nextFavorite);
        persist({ isFavorite: nextFavorite });
        setFavoriteMessage(nextFavorite ? "已收藏试卷" : "已取消收藏");
        if (!nextFavorite && isSavedReview) navigate("/modules/exam-preparation", { replace: true });
        return;
      }
      if (isFavorite) {
        setIsFavorite(false);
        setFavoriteMessage("已取消收藏");
        if (isSavedReview) navigate("/modules/exam-preparation", { replace: true });
        return;
      }
      const exerciseSelection = exam.selection || Object.fromEntries(
        Object.entries(exam.parts || {}).map(([key, exercise]) => [key, exercise.id])
      );
      const saved = await saveMockExam({
        exam_type: exam.exam_type || "telc",
        level: exam.level || "B1",
        exercise_selection: exerciseSelection,
        answers,
        writing_text: writingText,
        writing_assessment: writingAssessment,
        is_completed: phase === "results",
        is_favorite: true,
        progress: { phase, deadline, active_part: activePart, audio_step: audioStep, audio_step_started_at: audioStepStartedAt, early_submitted: wasEarlySubmitted },
      });
      setAttemptId(saved.id); setIsFavorite(true);
      localStorage.setItem(activeAttemptKey, String(saved.id));
      setFavoriteMessage("已收藏试卷");
    } catch (error) {
      setFavoriteMessage(error?.data?.message || "收藏失败，请稍后重试");
    } finally {
      setFavoritePending(false);
    }
  }

  async function toggleQuestionFavorite(partKey, itemId) {
    if (phase !== "results") return;
    const config = PART_FAVORITE_CONFIG[partKey];
    const exercise = exam.parts[partKey];
    const item = config?.items(exercise).find((candidate) => candidate.id === itemId);
    if (!config || !item) return;
    const key = answerKey(partKey, itemId);
    const nextValue = !questionFavorites[key];
    const selectedKey = answers[key] || "";
    const payload = {
      [config.target]: itemId,
      is_favorited: nextValue,
      answer_payload: partKey === "writing"
        ? { text: writingText, writing_assessment: writingAssessment, is_checked: true }
        : { selected_option_key: selectedKey },
    };
    const correctKey = itemCorrectKey(partKey, item);
    if (correctKey) payload.is_correct = selectedKey ? selectedKey === correctKey : null;
    setQuestionFavoritePending((previous) => ({ ...previous, [key]: true }));
    try {
      await config.save(payload);
      setQuestionFavorites((previous) => ({ ...previous, [key]: nextValue }));
    } catch (error) {
      setFavoriteMessage(error?.data?.message || "题目收藏保存失败，请稍后重试");
    } finally {
      setQuestionFavoritePending((previous) => ({ ...previous, [key]: false }));
    }
  }

  function favoriteFor(partKey, itemId) {
    const key = answerKey(partKey, itemId);
    return {
      isFavorited: !!questionFavorites[key],
      pending: !!questionFavoritePending[key],
      onClick: () => toggleQuestionFavorite(partKey, itemId),
      label: "收藏这道题",
    };
  }

  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const scores = useMemo(() => {
    if (!exam) return null;
    const readingCorrect = correctCount(exam.parts, answers, READING_PART_KEYS.slice(0, 3));
    const clozeCorrect = correctCount(exam.parts, answers, READING_PART_KEYS.slice(3));
    const listeningCorrect = correctCount(exam.parts, answers, LISTENING_PART_KEYS);
    const writing = writingAssessmentScore(writingAssessment);
    const raw = readingCorrect * 3.75 + clozeCorrect * 1.5 + listeningCorrect * 3.75 + writing;
    const percentage = Math.round((raw / 225) * 1000) / 10;
    return { readingCorrect, clozeCorrect, listeningCorrect, reading: readingCorrect * 3.75,
      cloze: clozeCorrect * 1.5, listening: listeningCorrect * 3.75, writing, raw,
      percentage, passed: raw >= 135 };
  }, [exam, answers, writingAssessment]);
  const answerSheetRows = useMemo(() => buildAnswerSheetRows(exam?.parts).map((row) => ({
    ...row,
    editable: row.group === "reading" ? phase === "reading" : phase === "listening",
  })), [exam, phase]);
  const questionNumbers = useMemo(() => Object.fromEntries(
    answerSheetRows.map((row) => [row.answerKey, row.number]),
  ), [answerSheetRows]);

  if (phase === "loading") return <div className="mock-exam-state"><span className="mock-exam-spinner" /><h1>正在准备模拟考试…</h1></div>;
  if (phase === "error") return <div className="mock-exam-state"><h1>暂时无法开始</h1><p>{errorText}</p><Link to="/modules/exam-preparation/purchase" className="mock-exam-primary">购买以解锁</Link><Link to="/modules/exam-preparation">返回备考季</Link></div>;
  if (!exam) return null;

  if (phase === "collection") {
    return <div className="mock-exam-state mock-exam-state--collection"><span className="mock-exam-kicker">第一部分已收卷</span><h1>答案已锁定</h1><p>听力考试将在倒计时结束后自动开始，请准备好耳机并保持页面开启。</p><div className="mock-exam-collection-timer"><strong className="mock-exam-big-time">{formatTime(remainingSeconds)}</strong><button className="mock-exam-submit-early" onClick={submitExamEarly}>提前交卷</button></div><button className="mock-exam-primary" onClick={enterListening}>立即进入听力</button></div>;
  }

  if (phase === "writing_review") {
    const example = exam.parts.writing?.example_texts?.[0];
    const assessmentComplete = isWritingAssessmentComplete(writingAssessment);
    return (
      <div className="mock-exam-review-backdrop" role="dialog" aria-modal="true" aria-labelledby="writing-review-title">
        <section className="mock-exam-writing-review">
          <div className="mock-exam-writing-review__body">
            <div className="mock-exam-writing-review__head"><div><span>Schreiben · 自评</span><h1 id="writing-review-title">对照范文评估你的写作</h1></div></div>
            <div className="mock-exam-writing-review__compare">
              <article><h2>Meine Antwort</h2><div>{textBlocks(writingText || "（未作答）")}</div></article>
              <article><h2>Beispieltext</h2><div>{textBlocks(example?.example_text || "暂无范文")}</div></article>
            </div>
            <div className="mock-exam-rubric"><h2>评分方法</h2><p>三个维度分别按 5、3、1、0 分计分，维度总分乘以 3，写作满分为 45 分。主题偏离时写作计 0 分。</p></div>
            <fieldset className="mock-exam-topic-check">
              <legend>文章是否围绕题目要求和给定情境展开？</legend>
              <label className={writingAssessment.topic_relevant === true ? "is-selected" : ""}>
                <input type="radio" name="writing-topic" checked={writingAssessment.topic_relevant === true}
                  onChange={() => setWritingAssessment((previous) => ({ ...previous, topic_relevant: true }))} />
                <strong>是</strong><span>继续评估三个评分维度</span>
              </label>
              <label className={writingAssessment.topic_relevant === false ? "is-selected" : ""}>
                <input type="radio" name="writing-topic" checked={writingAssessment.topic_relevant === false}
                  onChange={() => setWritingAssessment({ ...EMPTY_WRITING_ASSESSMENT, topic_relevant: false })} />
                <strong>否</strong><span>主题偏离，写作计 0 分</span>
              </label>
            </fieldset>
            {writingAssessment.topic_relevant === true ? <div className="mock-exam-assessment-list">
              {WRITING_CRITERIA.map((criterion) => (
                <fieldset className="mock-exam-grade-picker" key={criterion.key}>
                  <legend>{criterion.title}</legend>
                  {Object.entries(criterion.options).map(([grade, description]) => (
                    <label key={grade} className={writingAssessment[criterion.key] === grade ? "is-selected" : ""}>
                      <input type="radio" name={`writing-${criterion.key}`} value={grade}
                        checked={writingAssessment[criterion.key] === grade}
                        onChange={() => setWritingAssessment((previous) => ({ ...previous, [criterion.key]: grade }))} />
                      <strong>{grade}</strong><span>{WRITING_GRADE_POINTS[grade]} 分</span><p>{description}</p>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div> : null}
          </div>
          <div className="mock-exam-writing-review__actions mock-exam-writing-review__actions--sticky">
            <button
              className="mock-exam-writing-review__submit"
              disabled={!assessmentComplete}
              onClick={finishSelfAssessment}
              style={{
                backgroundColor: assessmentComplete ? "#f2bd61" : "#d8ddda",
                color: assessmentComplete ? "#2c2a22" : "#68756f",
              }}
            >
              查看得分
            </button>
          </div>
        </section>
      </div>
    );
  }

  const isResults = phase === "results";
  const visibleAnswerSheetRows = isResults
    ? answerSheetRows
    : answerSheetRows.filter((row) => row.group === phase);
  const visiblePartKeys = isResults ? ALL_REVIEW_PART_KEYS : phase === "reading" ? READING_PART_KEYS : phase === "listening" ? LISTENING_PART_KEYS : ["writing"];
  const audioLocked = phase === "listening" && audioPlaying;
  const partNavigationKeys = activePart === "writing"
    ? []
    : isResults
      ? REVIEW_NAVIGATION_PART_KEYS
      : phase === "reading"
        ? READING_PART_KEYS
        : phase === "listening"
          ? LISTENING_PART_KEYS
          : [];
  const activePartIndex = partNavigationKeys.indexOf(activePart);

  function moveToAdjacentPart(offset) {
    const nextPart = partNavigationKeys[activePartIndex + offset];
    if (!nextPart || audioLocked) return;
    setActivePart(nextPart);
    window.requestAnimationFrame(() => {
      exercisePartRef.current?.scrollIntoView?.({ block: "start" });
    });
  }

  return (
    <div className={`mock-exam-page${isResults ? " is-results" : ""}`}>
      <header className="mock-exam-header">
        <div><button className="mock-exam-back" onClick={() => navigate("/modules/exam-preparation")}>← 退出模拟</button><span className="mock-exam-kicker">telc B1 · 笔试模拟</span><h1>{isResults ? "考试结果与答案回顾" : phase === "reading" ? "Lesen & Sprachbausteine" : phase === "listening" ? "Hören" : "Schreiben"}</h1></div>
        <div className="mock-exam-header__actions">
          {isResults ? <button className={`mock-exam-utility${isFavorite ? " is-favorite" : ""}`} disabled={favoritePending} onClick={toggleFavorite}>{isFavorite ? "★ 已收藏" : "☆ 收藏本卷"}</button> : null}
          {!isResults ? <div className="mock-exam-timer-actions"><div className={`mock-exam-timer${remainingSeconds <= 300 ? " is-urgent" : ""}`}><span>剩余时间</span><strong>{formatTime(remainingSeconds)}</strong><small>{phase === "reading" ? "90 分钟" : "30 分钟"}</small></div><button className="mock-exam-submit-early" onClick={submitExamEarly}>提前交卷</button></div> : <button className="mock-exam-primary" onClick={newExam}>再考一套</button>}
        </div>
      </header>
      {favoriteMessage ? <p className="mock-exam-save-message" aria-live="polite">{favoriteMessage}</p> : null}

      {isResults && resultModalOpen ? (
        <div className="mock-exam-result-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mock-result-title">
          <section className={`mock-exam-result-modal${scores.passed ? " is-passed" : " is-failed"}`}>
            <div className="mock-exam-result-celebration" aria-hidden="true">
              {scores.passed ? <><i /><i /><i /></> : null}
              <span>{scores.passed ? "✓" : "↻"}</span>
              {scores.passed ? <><i /><i /><i /></> : null}
            </div>
            <h2 id="mock-result-title">{scores.passed ? "考试通过" : "再接再厉"}</h2>
            <strong>{formatScore(scores.raw)}<small> / 225 分</small></strong>
            <p>正确率 {scores.percentage.toFixed(1)}%</p>
            <p>{scores.passed ? "已达到笔试 135 分通过线。" : "本次尚未达到笔试 135 分通过线。"}</p>
            <button type="button" className="mock-exam-primary" onClick={() => setResultModalOpen(false)}>查看答题详情</button>
          </section>
        </div>
      ) : null}

      {isResults ? (
        <section className="mock-exam-results">
          <div className="mock-exam-result-main"><span>笔试成绩</span><strong>{formatScore(scores.raw)}<small> / 225</small></strong><b>{scores.passed ? "通过" : "未通过"}</b><p>正确率 {scores.percentage.toFixed(1)}%，通过线为 135 分。</p></div>
          <div className="mock-exam-result-grid">
            <article><span>Lesen</span><strong>{scores.reading.toFixed(2)} / 75</strong><small>{scores.readingCorrect} / 20 题</small></article>
            <article><span>Sprachbausteine</span><strong>{scores.cloze.toFixed(2)} / 30</strong><small>{scores.clozeCorrect} / 20 题</small></article>
            <article><span>Hören</span><strong>{scores.listening.toFixed(2)} / 75</strong><small>{scores.listeningCorrect} / 20 题</small></article>
            <article><span>Schreiben</span><strong>{scores.writing} / 45</strong><small>{wasEarlySubmitted ? (writingText.trim() ? "提前交卷，按 0 分" : "未作答，按 0 分") : writingAssessment.topic_relevant === false ? "主题偏离" : "三项自评"}</small></article>
          </div>
        </section>
      ) : null}

      {phase === "listening" ? (
        <section className="mock-exam-audio-status" aria-live="polite">
          {currentAudioAction?.kind === "audio" ? <><span className="mock-exam-audio-status__title">正在播放 · {PARTS[currentAudioAction.partKey].title}</span><strong>{currentAudioAction.playbackLabel}</strong></> : currentAudioAction?.kind === "break" ? <><span>录音间隔</span><strong>{formatTime(Math.max(0, COLLECTION_SECONDS - Math.floor((now - audioStepStartedAt) / 1000)))}</strong><small>接下来：{currentAudioAction.next}</small></> : <><span>录音播放完毕</span><strong>自由检查</strong><small>倒计时结束前可切换并修改答案</small></>}
          {needsAudioGesture ? <button onClick={playCurrentAudio}>点击继续播放录音</button> : null}
          <audio ref={audioRef} src={currentAudioExercise?.audio_file_url || undefined} onCanPlay={playCurrentAudio}
            onPlay={() => setAudioPlaying(true)} onPause={() => setAudioPlaying(false)}
            onEnded={handleAudioEnded} preload="auto" />
        </section>
      ) : null}

      <nav className="mock-exam-part-nav" aria-label="考试部分">
        {visiblePartKeys.map((key) => <button key={key} className={activePart === key ? "is-active" : ""}
          disabled={audioLocked && key !== activePart} onClick={() => setActivePart(key)} aria-label={PARTS[key].title}>
          <span className="mock-exam-part-nav__full">{PARTS[key].title}</span>
          <span className="mock-exam-part-nav__short" aria-hidden="true">{PARTS[key].short}</span>
        </button>)}
      </nav>

      <ExercisePart partKey={activePart} exercise={exam.parts[activePart]} answers={answers} setAnswer={setAnswer} setAnswers={setAnswers}
        disabled={isResults} review={isResults} writingText={writingText} setWritingText={setWritingText}
        favoriteFor={favoriteFor} questionNumbers={questionNumbers} sectionRef={exercisePartRef} />

      {activePartIndex >= 0 ? (
        <nav className="mock-exam-bottom-nav" aria-label="前后部分导航">
          <button type="button" aria-label="上一部分" title="上一部分"
            disabled={audioLocked || activePartIndex === 0} onClick={() => moveToAdjacentPart(-1)}>←</button>
          <button type="button" aria-label="下一部分" title="下一部分"
            disabled={audioLocked || activePartIndex === partNavigationKeys.length - 1} onClick={() => moveToAdjacentPart(1)}>→</button>
        </nav>
      ) : null}

      {visibleAnswerSheetRows.length ? (
        <MockExamAnswerSheet rows={visibleAnswerSheetRows} answers={answers} onAnswer={setAnswer} review={isResults} />
      ) : null}

      {!isResults ? <footer className="mock-exam-footer"><div><strong>上交答题卡</strong></div>{phase === "reading" ? <button onClick={finishReadingEarly}>完成本部分，进入听力</button> : phase === "listening" ? <button onClick={finishListeningEarly}>完成本部分，进入写作</button> : <button onClick={submitWriting}>提交写作并自评</button>}</footer> : null}
    </div>
  );
}
