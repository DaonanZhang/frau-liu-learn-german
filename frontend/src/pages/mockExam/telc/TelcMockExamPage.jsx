import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { confirmMockExamAction } from "../../../utils/confirmMockExamAction.js";
import { moveClozeMatchingOption } from "../../../utils/moveClozeMatchingOption.js";
import {
  createMockExam,
  fetchSavedMockExam,
  mockExamSessionKey,
  activeMockExamKey,
  saveMockExam,
  submitSavedMockExam,
  updateSavedMockExam,
} from "../../../api/exam_preparation/mockExams.js";
import { normalizeExamPreparationContent } from "../../../api/exam_preparation/contentText.js";
import { useAuth } from "../../../api/auth/useAuth.js";
import TelcMockExamAnswerSheet from "./TelcMockExamAnswerSheet.jsx";
import ExerciseOptionSheet from "../../../components/examPreparation/ExerciseOptionSheet.jsx";
import ExerciseFavoriteButton from "../../../components/examPreparation/ExerciseFavoriteButton.jsx";
import FormattedExplanation from "../../../components/examPreparation/FormattedExplanation.jsx";
import ListeningTranscript from "../../../components/examPreparation/ListeningTranscript.jsx";
import PresentationNotesContent from "../../../components/examPreparation/PresentationNotesContent.jsx";
import SpeakerMatchingExercise from "../../../components/examPreparation/SpeakerMatchingExercise.jsx";
import ReadingAdMatchingWorkspace from "../../../components/examPreparation/ReadingAdMatchingWorkspace.jsx";
import WritingExerciseWorkspace, { TranslationVisibilityIcon, VocabularyPages } from "../../../components/examPreparation/WritingExerciseWorkspace.jsx";
import {
  AnnotatableTextRegion,
  ExamTextAnnotationProvider,
} from "../../../components/examPreparation/ExamTextAnnotations.jsx";
import ScopedExplanation from "../../../components/examPreparation/ScopedExplanation.jsx";
import { hasScopedExplanation } from "../../../components/examPreparation/explanationVisibility.js";
import { examPreparationPurchasePath, examPreparationScope } from "../../../utils/examPreparationScope.js";
import { answerMatchesExpected, expectedHasMultipleAnswers } from "../../../utils/c1AnswerMatcher.js";
import { buildSpeakerMatchingRows, speakerMatchingAnswerIsCorrect } from "../../../utils/speakerMatching.js";
import { stopDownwardScrollChainAtBottom } from "../../../utils/scrollBoundary.js";
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
} from "../../../api/exam_preparation/userExerciseStates.js";
import { clearAnnotationScope, mockAnnotationScope } from "../../../utils/examTextAnnotations.js";
import { clozeOptionTextForOccurrence } from "../../../utils/clozePlaceholderText.js";
import useReliableAudioSources, { AUDIO_LOAD_ERROR } from "../../../hooks/useReliableAudioSources.js";
import {
  TELC_B2_LISTENING_TEIL2_INSTRUCTION,
  TELC_C1_LISTENING_INSTRUCTION_BY_FORMAT,
} from "../../examPreparationTypeContent.js";
import {
  ALL_REVIEW_PART_KEYS,
  COLLECTION_SECONDS,
  EARLY_SUBMISSION_WRITING_ASSESSMENT,
  EMPTY_WRITING_ASSESSMENT,
  INTRODUCTION_BY_PART,
  LISTENING_PART_KEYS,
  LISTENING_SECONDS,
  PARTS,
  READING_PART_KEYS,
  READING_SECONDS,
  WRITING_CRITERIA,
  WRITING_GRADE_POINTS,
  WRITING_SECONDS,
  audioSequenceForLevel,
} from "./telcMockExamRules.js";
import "./TelcMockExamPage.css";
import "../../ListeningExercisePage.css";
import "../../ReadingAdMatchingPage.css";
import "../../ExamPreparationWritingDetailPage.css";

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

const C1_READING_PART_KEYS = ["cloze_matching", "reading_ad_matching", "reading_understanding", "cloze_choice"];
const C1_LISTENING_PART_KEYS = ["listening_teil1", "listening_teil2", "listening_teil3"];
const C1_PARTS = {
  cloze_matching: { section: "reading", short: "L 1", title: "Lesen · Teil 1" },
  reading_ad_matching: { section: "reading", short: "L 2", title: "Lesen · Teil 2" },
  reading_understanding: { section: "reading", short: "L 3", title: "Lesen · Teil 3" },
  cloze_choice: { section: "reading", short: "SB 1", title: "Sprachbausteine · Teil 1" },
  listening_teil1: { section: "listening", short: "H 1", title: "Hören · Teil 1" },
  listening_teil2: { section: "listening", short: "H 2", title: "Hören · Teil 2" },
  listening_teil3: { section: "listening", short: "H 3", title: "Hören · Teil 3" },
  writing: { section: "writing", short: "Schr.", title: "Schreiben" },
};
const C1_ALL_REVIEW_PART_KEYS = [...C1_READING_PART_KEYS, ...C1_LISTENING_PART_KEYS, "writing"];
const C1_AUDIO_SEQUENCE = [
  { kind: "audio", partKey: "listening_teil1", playbackLabel: "einmal", playCount: 1 },
  { kind: "break", next: "Hören · Teil 2", durationSeconds: 30 },
  { kind: "audio", partKey: "listening_teil2", playbackLabel: "einmal", playCount: 1 },
  { kind: "break", next: "Hören · Teil 3", durationSeconds: 30 },
  { kind: "audio", partKey: "listening_teil3", playbackLabel: "einmal", playCount: 1 },
];

function isC1(level) {
  return String(level || "").trim().toUpperCase() === "C1";
}

function examPartKeys(level, section) {
  if (!isC1(level)) return section === "reading" ? READING_PART_KEYS : section === "listening" ? LISTENING_PART_KEYS : ALL_REVIEW_PART_KEYS;
  return section === "reading" ? C1_READING_PART_KEYS : section === "listening" ? C1_LISTENING_PART_KEYS : C1_ALL_REVIEW_PART_KEYS;
}

function activePartForScope(level, key) {
  if (isC1(level) && key === "reading_title_matching") return "cloze_matching";
  return key || examPartKeys(level, "reading")[0];
}

function c1ExamParts(exam) {
  if (!exam?.parts) return exam;
  const parts = { ...exam.parts };
  const exerciseType = (exercise) => String(exercise?.exercise_base?.exercise_type || exercise?.exercise_base?.exercise_type_display || "").toUpperCase();
  const find = (type, keys) => keys.map((key) => parts[key]).find((exercise) => exercise && exerciseType(exercise) === type);
  const matching = find("CLOZE_MATCHING", ["reading_title_matching", "reading_teil1", "cloze_matching"]);
  if (matching) parts.cloze_matching = matching;
  const adMatching = find("READING_AD_MATCHING", ["reading_ad_matching", "reading_teil2"]);
  if (adMatching) parts.reading_ad_matching = adMatching;
  const understanding = find("READING_UNDERSTANDING", ["reading_understanding", "reading_teil3"]);
  if (understanding) parts.reading_understanding = understanding;
  const clozeChoice = find("CLOZE_CHOICE", ["cloze_choice", "sprachbausteine_teil1"]);
  if (clozeChoice) parts.cloze_choice = clozeChoice;
  return { ...exam, parts };
}

function listeningQuestions(exercise, format, c1 = false) {
  if (c1) return exercise?.questions || [];
  if (exercise?.questions?.length) return exercise.questions;
  return (exercise?.content?.questions || []).map((question, index) => ({
    id: question.id || `question-${question.question_number || index + 1}`,
    question_number: question.question_number || index + 1,
    question_text: question.question,
    answer_options: (question.options || []).map((option, optionIndex) => ({
      id: option.id || `${index + 1}-${optionIndex + 1}`,
      option_key: option.option_key || String.fromCharCode(65 + optionIndex),
      option_text: option.text,
      is_correct: option.is_correct,
      explanation: option.explanation,
    })),
  }));
}

function c1WritingContent(exercise) {
  return exercise?.content && typeof exercise.content === "object" ? exercise.content : {};
}

function examPart(level, key) {
  return isC1(level) ? C1_PARTS[key] : PARTS[key];
}

function examDuration(level, section) {
  if (!isC1(level)) return section === "reading" ? READING_SECONDS : section === "listening" ? LISTENING_SECONDS : WRITING_SECONDS;
  return section === "reading" ? 90 * 60 : section === "listening" ? 40 * 60 : 70 * 60;
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

async function playAudioCompletionSignal() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  let context;
  try {
    context = new AudioContextClass();
    if (context.state === "suspended") await context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startedAt = context.currentTime;
    const endsAt = startedAt + 0.8;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(900, startedAt);
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.16, startedAt + 0.02);
    gain.gain.setValueAtTime(0.16, endsAt - 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    oscillator.connect(gain);
    gain.connect(context.destination);

    await new Promise((resolve) => {
      oscillator.onended = resolve;
      oscillator.start(startedAt);
      oscillator.stop(endsAt);
    });
  } catch {
    // Continue the exam when the browser cannot create or start the signal.
  } finally {
    try {
      await context?.close?.();
    } catch {
      // The signal has already finished; closing failure must not block the exam.
    }
  }
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

function canonicalizeWritingChoice(exam, choiceId) {
  const options = exam?.parts?.writing_options;
  if (!["B2", "C1"].includes(String(exam?.level || "").toUpperCase()) || !Array.isArray(options) || options.length !== 2) return exam;
  const selected = options.find((candidate) => String(candidate.id) === String(choiceId));
  return selected ? { ...exam, parts: { ...exam.parts, writing: selected } } : exam;
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

const MOCK_CLOZE_PART_PATTERN = /(\{\{blank_\d+\}\})/g;
const MOCK_CLOZE_SOURCE_BREAK_PATTERN = /(\r?\n+|<br\s*\/?>)/gi;

function splitMockClozeParts(content, partKey) {
  let flowIndex = 0;
  return String(normalizeExamPreparationContent(content) || "")
    .split(MOCK_CLOZE_PART_PATTERN)
    .filter(Boolean)
    .flatMap((part) => {
      if (/^\{\{blank_\d+\}\}$/.test(part)) {
        return [{ kind: "blank", value: part }];
      }
      return String(part).split(MOCK_CLOZE_SOURCE_BREAK_PATTERN).filter(Boolean).map((value) => {
        if (/^(?:\r?\n+|<br\s*\/?>)$/i.test(value)) {
          const breakCount = (value.match(/\r?\n/g) || []).length
            + (value.match(/<br\s*\/?>/gi) || []).length;
          flowIndex += Math.max(1, breakCount);
          return { kind: "break", value };
        }
        return {
          kind: "source",
          value,
          flowId: `${partKey}:source:${flowIndex}`,
        };
      });
    });
}

function renderMockClozeBreak(value, keyPrefix) {
  const breakCount = (String(value).match(/\r?\n/g) || []).length
    + (String(value).match(/<br\s*\/?>/gi) || []).length;
  return Array.from({ length: Math.max(1, breakCount) }, (_, index) => (
    <br key={`${keyPrefix}-break-${index}`} />
  ));
}

function C1WritingPrompt({ exercise, showTranslations = false, showHelpers = false }) {
  const [hiddenQuoteTranslations, setHiddenQuoteTranslations] = useState({});
  const quotes = exercise.quotes || c1WritingContent(exercise).quotes || [];
  const pages = exercise.vocabulary_pages || c1WritingContent(exercise).vocabulary_pages || [];
  if (!quotes.length && !(showHelpers && pages.length)) return null;
  return <>
    {showHelpers && (quotes.length || pages.length) ? <div className="telc-c1-writing-quotes__header">
      <h2>{quotes.length ? "写作引语" : "相关词汇"}</h2>
    </div> : null}
    {quotes.length ? <section className="telc-c1-writing-quotes" aria-label="写作引语">
      {quotes.slice(0, 2).map((quote, index) => {
        const quoteTitle = `Zitate ${index + 1}`;
        const translationVisible = showHelpers ? !hiddenQuoteTranslations[index] : showTranslations;
        return <article key={quote.id || index}>
          <div className="telc-c1-writing-quote__header">
            <h3>{quoteTitle}</h3>
            {showHelpers && quote.translation_zh ? <button
              type="button"
              className="writing-translation-toggle"
              aria-label={`${translationVisible ? "隐藏" : "显示"} ${quoteTitle} 中文翻译`}
              title="翻译"
              onClick={() => setHiddenQuoteTranslations((current) => ({
                ...current,
                [index]: !current[index],
              }))}
            >
              <TranslationVisibilityIcon hidden={!translationVisible} />
            </button> : null}
          </div>
          <MockTextRegion as="blockquote" regionId={`writing:quote:${index}`}>{quote.text || ""}</MockTextRegion>
          {translationVisible && quote.translation_zh ? <p>{quote.translation_zh}</p> : null}
        </article>;
      })}
    </section> : null}
    {showHelpers && pages.length ? <VocabularyPages pages={pages} /> : null}
  </>;
}

function MockTextRegion({ regionId, as = "span", children, ...props }) {
  return <AnnotatableTextRegion as={as} regionId={regionId} {...props}>{children}</AnnotatableTextRegion>;
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
  annotationRegionPrefix = "",
  annotationQuestionId = "",
  questionNumber = "",
  questionText = "",
  practiceLayout = false,
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
    <article className={`${prefix}-question-card${practiceLayout ? "" : " telc-mock-exam-choice-field"}${!practiceLayout && isCorrect ? " is-correct" : ""}${!practiceLayout && isWrong ? " is-wrong" : ""}`}>
      {label ? <div className={`${prefix}-question-card__header`}>
        {practiceLayout ? <div className={`${prefix}-question-card__titleWrap`}>
          {questionNumber ? <span className={`${prefix}-question-card__number`}>Aufgabe {questionNumber}</span> : null}
          {annotationRegionPrefix && annotationQuestionId
            ? <MockTextRegion as="h3" regionId={`${annotationRegionPrefix}:question:${annotationQuestionId}`}>{questionText || label}</MockTextRegion>
            : <h3>{questionText || label}</h3>}
        </div> : <h3>
          {questionNumber ? <><span>{questionNumber}.</span>{" "}</> : null}
          {annotationRegionPrefix && annotationQuestionId
            ? <MockTextRegion regionId={`${annotationRegionPrefix}:question:${annotationQuestionId}`}>{questionText || label}</MockTextRegion>
            : questionText || label}
        </h3>}
        {favorite && !review ? <ExerciseFavoriteButton {...favorite} /> : null}
      </div> : null}
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
              {variant !== "listening" ? <span className={`${prefix}-option__key`}>{optionKey}</span> : null}
              {variant !== "listening" ? (
                <MockTextRegion as="span" className={`${prefix}-option__text`}
                  regionId={`${annotationRegionPrefix}:option:${annotationQuestionId}:${optionKey}`}>
                  {textBlocks(optionText)}
                </MockTextRegion>
              ) : (
                <MockTextRegion as="span" className={`${prefix}-option__key`}
                  regionId={`${annotationRegionPrefix}:option:${annotationQuestionId}:${optionKey}`}>
                  {textBlocks(optionText)}
                </MockTextRegion>
              )}
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
            Richtige Antwort: {practiceLayout ? correctText || correctKey || "-" : <>{correctKey || "-"}{correctText ? ` - ${correctText}` : ""}</>}
          </p>
          {hasScopedExplanation(explanation, options) ? (
            <p className={`${feedbackPrefix}-feedback__line`}>
              Erklärung: <MockTextRegion as="span" regionId={`${annotationRegionPrefix}:explanation:${annotationQuestionId}`}>
                <ScopedExplanation
                  explanation={explanation}
                  explanationScope={explanationScope}
                  options={options}
                />
              </MockTextRegion>
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
  annotationRegionPrefix = "",
  annotationId = "",
  selectedText = "",
}) {
  const [open, setOpen] = useState(false);
  const isCorrect = Boolean(value) && value === correctKey;
  const stateClass = review ? (isCorrect ? " is-correct" : " is-wrong") : "";
  const displayedValue = value;
  const selected = options.find((option) => option.option_key === displayedValue);
  const annotateOptions = variant !== "cloze";
  const buttonClass = variant === "title"
    ? `reading-title-select reading-title-select-trigger${value && !review ? " reading-title-select--selected" : ""}${review && isCorrect ? " reading-title-select--correct" : ""}${review && !isCorrect ? " reading-title-select--wrong" : ""}`
    : `cloze-choice-slot-trigger${displayedValue ? " cloze-drop-slot__chip" : " cloze-choice-slot-trigger--empty"}${review && isCorrect ? " cloze-drop-slot__chip--correct" : ""}${review && !isCorrect ? " cloze-drop-slot__chip--wrong" : ""}`;
  return (
    <span className={`telc-mock-exam-inline-answer${stateClass}`}>
      <button type="button" className={buttonClass} disabled={disabled} onClick={() => setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open}>
        {selected && variant === "title" ? (
          <>
            <span className="reading-title-select__key">{selected.option_key}</span>
            {open ? <span className="reading-title-select__label">{selected.option_text}</span> : (
              <MockTextRegion as="span" className="reading-title-select__label"
                regionId={`${annotationRegionPrefix}:option:${annotationId}:${selected.option_key}`}>
                {selected.option_text}
              </MockTextRegion>
            )}
          </>
        ) : selected ? (
          open ? selected.option_text : (
            annotateOptions
              ? <MockTextRegion as="span" regionId={`${annotationRegionPrefix}:option:${annotationId}:${selected.option_key}`}>
                {selectedText || selected.option_text}
              </MockTextRegion>
              : <span>{selectedText || selected.option_text}</span>
          )
        ) : (variant === "title" ? "Überschrift auswählen" : placeholder)}
      </button>
      <ExerciseOptionSheet open={open} title={title || "请选择答案"} selectedValue={displayedValue || ""}
        options={options.map((option) => ({ value: option.option_key, label: option.option_text, meta: option.option_key }))}
        metaPlacement={variant === "title" ? "before" : "after"}
        renderOptionLabel={(option) => (
          annotateOptions
            ? <MockTextRegion as="span" regionId={`${annotationRegionPrefix}:option:${annotationId}:${option.value}`}>
              {option.label}
            </MockTextRegion>
            : <span>{option.label}</span>
        )}
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
              Erklärung: <span>
                <ScopedExplanation
                  explanation={explanation}
                  explanationScope={explanationScope}
                  options={options}
                />
              </span>
            </span>
          ) : null}
        </span>
      ) : favorite && !review ? <ExerciseFavoriteButton {...favorite} /> : null}
    </span>
  );
}

function ClozeChoiceText({ content, blanks, optionsForBlank, partKey, answers, setAnswer, disabled, review, favoriteFor, questionNumbers }) {
  const blankMap = Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank]));
  const parts = splitMockClozeParts(content, partKey);
  return parts.map((part, index) => {
      if (part.kind === "break") {
        return renderMockClozeBreak(part.value, `${partKey}-${index}`);
      }
      if (part.kind === "source") {
        return <MockTextRegion key={`${index}-${part.value}`} as="span" regionId={`${partKey}:source:${index}`} flowId={part.flowId}>
          {textBlocks(part.value)}
        </MockTextRegion>;
      }
      const blank = blankMap[part.value.replace(/[{}]/g, "")];
      if (!blank) return <span key={part.value}>{part.value}</span>;
      const key = answerKey(partKey, blank.id);
      const displayNumber = displayQuestionNumber(questionNumbers, partKey, blank.id, blank.blank_number || blank.blank_key || "");
      const occurrenceIndex = parts.slice(0, index).filter((candidate) => candidate.kind === "blank" && candidate.value === part.value).length;
      const occurrenceCount = parts.filter((candidate) => candidate.kind === "blank" && candidate.value === part.value).length;
      const selectedOption = optionsForBlank(blank).find((option) => option.option_key === answers[key]);
      return (
        <MatchingSelect
          key={`${key}:${index}`}
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
          annotationRegionPrefix={partKey}
          annotationId={blank.id}
          selectedText={clozeOptionTextForOccurrence(selectedOption?.option_text, occurrenceIndex, occurrenceCount)}
        />
      );
    });
}

function MockClozeMatching({ exercise, answers, setAnswers, partKey, disabled, review, favoriteFor, questionNumbers, restrictExample = false }) {
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [activeBlankKey, setActiveBlankKey] = useState("");
  const [touchDrag, setTouchDrag] = useState(null);
  const blanks = exercise.blank_answers || [];
  const options = exercise.options || [];
  const blankMap = Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank]));
  const optionMap = Object.fromEntries(options.map((option) => [option.option_key, option]));
  const blankKeys = blanks.map((blank) => answerKey(partKey, blank.id));
  const usedOptionKeys = new Set(blankKeys.map((key) => answers[key]).filter(Boolean));
  const poolOptions = options.filter((option) => !usedOptionKeys.has(option.option_key));
  const exampleBlank = blanks.find((blank) => Number(blank.blank_number) === 0 || blank.blank_key === "blank_0");
  const exampleOptionKey = exampleBlank?.correct_option?.option_key || "";
  const exampleAnswered = Boolean(exampleBlank && answers[answerKey(partKey, exampleBlank.id)]);
  const nextQuestionBlank = restrictExample
    ? blanks
      .filter((blank) => Number(blank.blank_number) >= 1)
      .sort((left, right) => Number(left.blank_number) - Number(right.blank_number))
      .find((blank) => !answers[answerKey(partKey, blank.id)])
    : null;
  const resolvedActiveBlankKey = activeBlankKey || exampleBlank?.blank_key || blanks[0]?.blank_key || "";
  const activeBlank = blankMap[resolvedActiveBlankKey];
  const visiblePoolOptions = restrictExample
    ? poolOptions.filter((option) => resolvedActiveBlankKey === exampleBlank?.blank_key
      ? option.option_key === exampleOptionKey
      : option.option_key !== exampleOptionKey)
    : poolOptions;
  const shouldPromptNextBlank = restrictExample
    && exampleAnswered
    && Boolean(nextQuestionBlank)
    && !visiblePoolOptions.length;

  function assignOption(blank, optionKey) {
    if (disabled) return;
    if (restrictExample) {
      const isExampleBlank = Number(blank.blank_number) === 0 || blank.blank_key === "blank_0";
      const isExampleOption = optionKey === exampleOptionKey;
      if (isExampleBlank !== isExampleOption) {
        setSelectedOptionKey("");
        return;
      }
    }
    setAnswers((previous) => moveClozeMatchingOption(
      previous,
      blankKeys,
      answerKey(partKey, blank.id),
      optionKey,
    ));
    setSelectedOptionKey("");
  }

  function handleTouchDragStart(event, optionKey, sourceKey = "") {
    if (disabled || !["touch", "pen"].includes(event.pointerType)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTouchDrag({ optionKey, sourceKey, x: event.clientX, y: event.clientY });
  }

  function handleTouchDragMove(event) {
    if (!touchDrag) return;
    setTouchDrag((previous) => ({ ...previous, x: event.clientX, y: event.clientY }));
  }

  function handleTouchDragEnd(event) {
    if (!touchDrag) return;
    const pointTarget = document.elementFromPoint?.(event.clientX, event.clientY);
    const target = event.target?.closest?.("[data-telc-mock-cloze-blank]")
      || pointTarget?.closest?.("[data-telc-mock-cloze-blank]");
    const blank = target ? blankMap[target.dataset.telcMockClozeBlank] : null;
    if (blank) assignOption(blank, touchDrag.optionKey);
    else if (touchDrag.sourceKey && (
      event.target?.closest?.(".telc-mock-cloze-matching-pool")
      || pointTarget?.closest?.(".telc-mock-cloze-matching-pool")
    )) {
      setAnswers((previous) => ({ ...previous, [touchDrag.sourceKey]: "" }));
    }
    setTouchDrag(null);
  }

  function clearDragState() {
    setTouchDrag(null);
    setSelectedOptionKey("");
  }

  return (
    <>
      {!review ? (
        <section className="telc-mock-cloze-matching-pool telc-mock-cloze-matching-pool--sticky" aria-label="选项区"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const sourceKey = event.dataTransfer.getData("application/x-telc-mock-cloze-source");
            if (sourceKey) {
              setAnswers((previous) => ({ ...previous, [sourceKey]: "" }));
            }
            clearDragState();
          }}
          onPointerMove={handleTouchDragMove} onPointerUp={handleTouchDragEnd} onPointerCancel={clearDragState}>
          <div className="telc-mock-cloze-matching-pool__heading"><strong>选项区</strong><span>{restrictExample ? "拖动到对应空格中" : "拖动或选择一个选项后点击对应空格"}</span></div>
          <div className="telc-mock-cloze-matching-pool__options">
            {visiblePoolOptions.map((option) => {
              const optionButton = (
                <button
                  key={option.option_key}
                  type="button"
                  className={`telc-mock-cloze-matching-pool__option${selectedOptionKey === option.option_key ? " is-selected" : ""}`}
                  draggable={!disabled}
                  onClick={() => {
                    if (restrictExample) {
                      if (!activeBlank) return;
                      assignOption(activeBlank, option.option_key);
                      setActiveBlankKey(blanks.find((blank) => blank.blank_key !== activeBlank.blank_key)?.blank_key || activeBlank.blank_key);
                      return;
                    }
                    setSelectedOptionKey((previous) => previous === option.option_key ? "" : option.option_key);
                  }}
                  aria-label={restrictExample ? `选择“${option.option_text}”并填入当前空格` : undefined}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", option.option_key);
                    event.dataTransfer.setData("application/x-telc-mock-cloze-source", "");
                    setSelectedOptionKey(option.option_key);
                  }}
                  onDragEnd={clearDragState}
                  onPointerDown={(event) => handleTouchDragStart(event, option.option_key)}
                  onPointerMove={handleTouchDragMove}
                  onPointerUp={handleTouchDragEnd}
                  onPointerCancel={clearDragState}
                >
                  <span>{option.option_text}</span>
                </button>
              );
              if (restrictExample && option.option_key === exampleOptionKey) {
                return (
                  <span key={option.option_key} className="telc-c1-cloze-matching__example-option">
                    {optionButton}
                    {!exampleAnswered ? <span className="telc-c1-cloze-matching__guide">将 Beispiel 拖到标有 0 的空格中</span> : null}
                  </span>
                );
              }
              return optionButton;
            })}
            {shouldPromptNextBlank ? (
              <span className="telc-mock-cloze-matching-pool__empty">请点击下一个绿色空格继续选择</span>
            ) : !poolOptions.length ? (
              <span className="telc-mock-cloze-matching-pool__empty">所有选项均已填入空格。</span>
            ) : null}
          </div>
        </section>
      ) : null}
      <div
        className="telc-mock-exam-source-text telc-mock-cloze-matching-text telc-mock-cloze-matching-text--compact"
        onWheel={restrictExample ? stopDownwardScrollChainAtBottom : undefined}
      >
        {splitMockClozeParts(exercise.content_with_placeholders, partKey).map((part, index) => {
            if (part.kind === "break") {
              return renderMockClozeBreak(part.value, `${partKey}-${index}`);
            }
            if (part.kind === "source") {
              return <MockTextRegion key={`${index}-${part.value}`} as="span" regionId={`${partKey}:source:${index}`} flowId={part.flowId}>
                {textBlocks(part.value)}
              </MockTextRegion>;
            }
            const blank = blankMap[part.value.replace(/[{}]/g, "")];
            if (!blank) return <span key={part.value}>{part.value}</span>;
            const key = answerKey(partKey, blank.id);
            const selectedKey = answers[key] || "";
            const correctKey = blank.correct_option?.option_key || "";
            const displayNumber = displayQuestionNumber(questionNumbers, partKey, blank.id, blank.blank_number ?? "");
            const isCorrect = review && selectedKey === correctKey;
            const isWrong = review && selectedKey !== correctKey;
            const isGuided = restrictExample && exampleAnswered && blank === nextQuestionBlank;
            return (
              <span key={`${key}:${index}`} className="telc-mock-cloze-matching-blank">
                <span
                  data-telc-mock-cloze-blank={blank.blank_key}
                  className={`telc-mock-cloze-matching-slot${selectedOptionKey ? " is-ready" : ""}${selectedKey && !review ? " is-inline-selected" : ""}${isCorrect ? " is-correct" : ""}${isWrong ? " is-wrong" : ""}${isGuided ? " is-guided" : ""}`}
                  onClick={() => {
                    if (restrictExample) {
                      setActiveBlankKey(blank.blank_key);
                      return;
                    }
                    if (selectedOptionKey) assignOption(blank, selectedOptionKey);
                    else if (selectedKey) assignOption(blank, "");
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onPointerUp={handleTouchDragEnd}
                  onDrop={(event) => {
                    event.preventDefault();
                    assignOption(blank, event.dataTransfer.getData("text/plain") || selectedOptionKey);
                  }}
                >
                  {selectedKey ? (
                    <span
                      className={`telc-mock-cloze-matching-slot__chip${!disabled ? " is-draggable" : ""}`}
                      draggable={!disabled}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", selectedKey);
                        event.dataTransfer.setData("application/x-telc-mock-cloze-source", key);
                        setSelectedOptionKey(selectedKey);
                      }}
                      onDragEnd={clearDragState}
                      onPointerDown={(event) => handleTouchDragStart(event, selectedKey, key)}
                      onPointerMove={handleTouchDragMove}
                      onPointerUp={handleTouchDragEnd}
                      onPointerCancel={clearDragState}
                    >
                      <span>
                        {optionMap[selectedKey]?.option_text || selectedKey}
                      </span>
                    </span>
                  ) : <span>{displayNumber}</span>}
                </span>
                {review && isWrong ? <small>正确答案：{optionMap[correctKey]?.option_text || correctKey || "—"}</small> : null}
              </span>
            );
          })}
      </div>
      {touchDrag ? <span className="telc-mock-cloze-matching-touch-preview" style={{ left: touchDrag.x, top: touchDrag.y }}>{optionMap[touchDrag.optionKey]?.option_text || touchDrag.optionKey}</span> : null}
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
                  <p>Erklärung: <span><FormattedExplanation text={blank.explanation} /></span></p>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </>
  );
}

function ExercisePart({ partKey, exercise, answers, setAnswer, setAnswers, disabled = false, review = false, writingText, setWritingText, favoriteFor, questionNumbers, sectionRef, examLabel, examLevel }) {
  if (!exercise) return <p>该部分题目加载失败。</p>;
  const partInfo = examPart(examLevel, partKey);
  const heading = exercise.exercise_base?.title || partInfo.title;
  const c1ListeningFormat = isC1(examLevel) && partKey.startsWith("listening_")
    ? exercise.content?.format || exercise.listening_type || "multiple_choice"
    : "";
  const c1ListeningIntroduction = TELC_C1_LISTENING_INSTRUCTION_BY_FORMAT[c1ListeningFormat] || "";
  const defaultIntroduction = isC1(examLevel) && partKey === "reading_title_matching"
    ? INTRODUCTION_BY_PART.cloze_matching
    : isC1(examLevel) && partKey === "reading_ad_matching"
      ? "Lesen Sie den Text mit den Abschnitten A–E und ordnen Sie jeder Aussage den passenden Abschnitt zu. Ein Abschnitt kann mehrfach gewählt werden."
      : INTRODUCTION_BY_PART[partKey];
  const baseIntroduction = String(exercise.instruction || defaultIntroduction || "").trim();
  const introduction = String(examLevel || "").toUpperCase() === "B2" && partKey === "listening_teil2"
    ? TELC_B2_LISTENING_TEIL2_INSTRUCTION
    : c1ListeningIntroduction || listeningIntroduction(partKey, exercise, questionNumbers, baseIntroduction);

  let body = null;
  if (partKey === "reading_title_matching") {
    if (isC1(examLevel)) {
      body = <MockClozeMatching exercise={exercise} answers={answers} setAnswers={setAnswers} partKey={partKey}
        disabled={disabled} review={review} favoriteFor={(id) => favoriteFor(partKey, id)} questionNumbers={questionNumbers} restrictExample />;
    } else {
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
                disabled={disabled} review={review} variant="title" title={`Text ${displayNumber}`}
                annotationRegionPrefix={partKey} annotationId={`title:${item.id}`} />
            </div>
            <MockTextRegion as="div" regionId={`${partKey}:item:${item.id}`}>{textBlocks(item.text)}</MockTextRegion>
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
                    Erklärung: <MockTextRegion as="span" regionId={`${partKey}:explanation:${item.id}`}><FormattedExplanation text={item.explanation} /></MockTextRegion>
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>;
        })}</div>
      </>
    );
    }
  } else if (partKey === "reading_understanding") {
    const questionCards = (exercise.questions || []).map((question) => {
          const key = answerKey(partKey, question.id);
          const displayNumber = displayQuestionNumber(questionNumbers, partKey, question.id, question.question_number);
          const correct = (question.answer_options || []).find((option) => option.is_correct)?.option_key;
          return <ChoiceField key={key} label={question.question_text}
            value={answers[key] || ""} options={question.answer_options || []} correctKey={correct}
            onChange={(value) => setAnswer(key, value)} disabled={disabled} review={review} variant="reading"
            explanation={question.explanation} explanationScope={question.explanation_scope}
            favorite={review ? favoriteFor(partKey, question.id) : null}
            annotationRegionPrefix={partKey} annotationQuestionId={question.id}
            questionNumber={displayNumber} questionText={question.question_text} />;
        });
    const passage = <MockTextRegion as="div" className="telc-mock-exam-source-text" regionId={`${partKey}:passage`}>{textBlocks(exercise.text_markdown)}</MockTextRegion>;
    body = isC1(examLevel) ? (
      <div className="telc-c1-reading-understanding">
        <section className="telc-c1-reading-understanding__text" onWheel={stopDownwardScrollChainAtBottom}>{passage}</section>
        <section className="telc-c1-reading-understanding__questions" onWheel={stopDownwardScrollChainAtBottom}>{questionCards}</section>
      </div>
    ) : <>{passage}{questionCards}</>;
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
        annotationsEnabled
        annotationRegionPrefix={partKey}
        allowRepeated={isC1(examLevel)}
        showAllAds={isC1(examLevel)}
      />
    </>;
  } else if (partKey === "cloze_choice") {
    body = <div className="telc-mock-exam-source-text"><ClozeChoiceText content={exercise.content_with_placeholders}
      blanks={exercise.blanks || []} optionsForBlank={(blank) => blank.options || []} partKey={partKey}
      answers={answers} setAnswer={setAnswer} disabled={disabled} review={review}
      favoriteFor={(id) => favoriteFor(partKey, id)} questionNumbers={questionNumbers} /></div>;
  } else if (partKey === "cloze_matching") {
    const matching = <MockClozeMatching exercise={exercise} answers={answers} setAnswers={setAnswers} partKey={partKey}
      disabled={disabled} review={review} favoriteFor={(id) => favoriteFor(partKey, id)} questionNumbers={questionNumbers}
      restrictExample={isC1(examLevel)} />;
    body = isC1(examLevel) ? <div className="telc-c1-cloze-matching">{matching}</div> : matching;
  } else if (partKey.startsWith("listening_")) {
    const listeningContent = exercise.content && typeof exercise.content === "object" ? exercise.content : {};
    const format = listeningContent.format || exercise.listening_type || "multiple_choice";
    const noteContent = listeningContent.content_with_placeholders || listeningContent.notes_with_placeholders || listeningContent.text_with_placeholders;
    const noteBlanks = listeningContent.blanks || exercise.blanks || [];
    const isTelcC1 = isC1(examLevel);
    const questions = listeningQuestions(exercise, format, isTelcC1);
    const listeningTasks = <>
      {format === "speaker_matching" ? <SpeakerMatchingExercise
        exercise={exercise}
        valueFor={(question) => answers[answerKey(partKey, question.id)]}
        onChange={(question, value) => setAnswer(answerKey(partKey, question.id), value)}
        disabled={disabled}
        review={review}
        questionNumberFor={(row, index) => displayQuestionNumber(
          questionNumbers,
          partKey,
          row.question.id,
          47 + index,
        )}
        annotationRegionPrefix={partKey}
      /> : null}
      {format === "presentation_notes" && noteContent ? <div className="telc-mock-exam-source-text">
        <ClozeChoiceText content={noteContent} blanks={noteBlanks}
          optionsForBlank={(blank) => blank.options || blank.answer_options || []} partKey={partKey}
          answers={answers} setAnswer={setAnswer} disabled={disabled} review={review}
          favoriteFor={(id) => favoriteFor(partKey, id)} questionNumbers={questionNumbers} />
      </div> : null}
      {format === "presentation_notes" && !noteContent ? <>
        {(listeningContent.slides || []).map((slide, slideIndex) => <article
          className={isTelcC1 ? "listening-exercise-question-card listening-exercise-c1-slide" : "telc-c1-presentation-notes__slide"}
          key={slide.number || slideIndex}
        >
          {isTelcC1 ? <h3>Folie {slide.number}</h3> : null}
          <PresentationNotesContent
            text={slide.text}
            questions={questions}
            expectedQuestionKeys={(slide.answers || []).map((answer) => answer.blank_id)}
            values={Object.fromEntries(questions.map((question) => [
              question.id,
              answers[answerKey(partKey, question.id)] || "",
            ]))}
            disabled={disabled}
            review={review}
            questionNumberFor={(question) => displayQuestionNumber(
              questionNumbers,
              partKey,
              question.id,
              64 + Number(question.question_number || 1),
            )}
            onChange={(question, value) => setAnswer(answerKey(partKey, question.id), value)}
            answerIsCorrect={(question, value) => answerMatchesExpected(value, question.correct_answer)}
            hasMultipleAnswers={expectedHasMultipleAnswers}
            correctAnswerPrefix="Richtige Antwort: "
          />
        </article>)}
      </> : null}
      {format !== "presentation_notes" && format !== "speaker_matching" ? questions.map((question) => {
        const key = answerKey(partKey, question.id);
        const displayNumber = displayQuestionNumber(questionNumbers, partKey, question.id, question.question_number);
        const correct = (question.answer_options || []).find((option) => option.is_correct)?.option_key;
        return <ChoiceField key={key} label={question.question_text || question.statement || question.prompt}
          value={answers[key] || ""} options={question.answer_options || []} correctKey={correct}
          onChange={(value) => setAnswer(key, value)} disabled={disabled} review={review} variant="listening"
          explanation={question.explanation} explanationScope={question.explanation_scope}
          favorite={review && !(isTelcC1 && format === "speaker_matching") ? favoriteFor(partKey, question.id) : null}
          annotationRegionPrefix={partKey} annotationQuestionId={question.id}
          questionNumber={displayNumber} questionText={question.question_text}
          practiceLayout={isTelcC1} />;
      }) : null}
    </>;
    body = <div className={`telc-c1-listening telc-c1-listening--${format}`} data-listening-format={format}>
      {isTelcC1 ? <section className={`listening-exercise-questions${format === "presentation_notes" ? " listening-exercise-questions--presentation" : ""}`}>
        <div className="listening-exercise-questions__header">
          <div>
            <h2>{format === "presentation_notes" ? "Präsentation" : "Aufgaben"}</h2>
            <p className="listening-exercise-questions__sub">
              {format === "presentation_notes"
                ? "Ergänze die fehlenden Angaben direkt in den Folien."
                : "Wähle pro Aufgabe genau eine Antwort aus."}
            </p>
          </div>
        </div>
        <div className={`listening-exercise-question-list${format === "presentation_notes" ? " listening-exercise-question-list--slides" : ""}`}>{listeningTasks}</div>
      </section> : listeningTasks}
    </div>;
  } else if (partKey === "writing") {
    const isTelcB2 = String(examLevel || "").toUpperCase() === "B2";
    const isTelcC1 = isC1(examLevel);
    const wordLimit = Number(exercise.words_limit) || (isTelcC1 ? 350 : isTelcB2 ? 150 : 0);
    body = (
      <>
        <WritingExerciseWorkspace
          exercise={exercise}
          isTelcB2={isTelcB2}
          isTelcC1={isTelcC1}
          showTranslations={review}
          showVocabulary={review}
          value={writingText}
          onChange={(event) => setWritingText(event.target.value)}
          disabled={disabled}
          requestRegionId={`${partKey}:request`}
          promptRegionId={`${partKey}:task`}
          inputHeaderAction={review ? <ExerciseFavoriteButton {...favoriteFor(partKey, exercise.id)} /> : null}
          metaPanel={(
            <section className="writing-detail-meta-panel">
              <div className="writing-detail-meta-chip">{wordLimit ? `${isTelcB2 ? "最少" : "至少"} ${wordLimit} 词` : "字数不限"}</div>
            </section>
          )}
        />
      </>
    );
  }

  return (
    <section ref={sectionRef} className={`telc-mock-exam-paper${partKey === "writing" ? " telc-mock-exam-paper--writing" : ""}`}>
      <div className="telc-mock-exam-paper__heading">
        <div><span>{partInfo.title}</span><h2>{heading}</h2></div>
        <span className="telc-mock-exam-paper__badge">{examLabel}</span>
      </div>
      {introduction ? (
        <section className="telc-mock-exam-introduction">
          <span className="telc-mock-exam-introduction__label">Einleitung</span>
          <MockTextRegion as="p" regionId={`${partKey}:introduction`}>{textBlocks(introduction)}</MockTextRegion>
        </section>
      ) : null}
      {partKey.startsWith("listening_") && review ? (
        <ListeningTranscript script={exercise.script} annotationRegionPrefix={`${partKey}:transcript`} annotationsEnabled />
      ) : null}
      {body}
    </section>
  );
}

function correctCount(parts, answers, partKeys, level) {
  let correct = 0;
  partKeys.forEach((partKey) => {
    const exercise = parts[partKey] || {};
    if (partKey === "reading_title_matching") {
      if (isC1(level)) {
        (exercise.blank_answers || []).forEach((item) => { correct += answers[answerKey(partKey, item.id)] === item.correct_option?.option_key ? 1 : 0; });
      } else {
        (exercise.items || []).forEach((item) => { correct += answers[answerKey(partKey, item.id)] === item.correct_option?.option_key ? 1 : 0; });
      }
    } else if (partKey === "reading_understanding" || partKey.startsWith("listening_")) {
      const listeningFormat = exercise.content?.format;
      const questions = partKey.startsWith("listening_") ? listeningQuestions(exercise, listeningFormat, isC1(level)) : exercise.questions || [];
      questions.forEach((question) => {
        if (partKey.startsWith("listening_") && listeningFormat === "presentation_notes") {
          correct += answerMatchesExpected(answers[answerKey(partKey, question.id)], question.correct_answer) ? 1 : 0;
          return;
        }
        if (partKey === "listening_teil1" && listeningFormat === "speaker_matching") {
          const row = buildSpeakerMatchingRows(exercise).find((item) => item.question.id === question.id);
          correct += row && speakerMatchingAnswerIsCorrect(row, answers[answerKey(partKey, question.id)]) ? 1 : 0;
          return;
        }
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
      (exercise.blank_answers || []).filter((blank) => !isC1(level)
        || (Number(blank.blank_number) !== 0 && blank.blank_key !== "blank_0"))
        .forEach((blank) => { correct += answers[answerKey(partKey, blank.id)] === blank.correct_option?.option_key ? 1 : 0; });
    }
  });
  return correct;
}

function buildAnswerSheetRows(parts, level) {
  if (!parts) return [];
  const rows = [];
  let number = 1;
  const add = (partKey, partLabel, group, items, options, correctKey, fixedNumberStart = null) => {
    items.forEach((item, itemIndex) => {
      const itemOptions = typeof options === "function" ? options(item) : options;
      const isC1Example = isC1(level) && partKey === "cloze_matching"
        && (Number(item.blank_number) === 0 || item.blank_key === "blank_0");
      rows.push({
        answerKey: answerKey(partKey, item.id),
        partKey,
        partLabel,
        group,
        number: isC1Example ? 0 : fixedNumberStart == null ? number : fixedNumberStart + itemIndex,
        options: (itemOptions || []).map((option) => ({
          optionKey: option.option_key ?? option.ad_key,
          optionText: option.option_text ?? option.ad_text_markdown ?? "",
        })),
        optionKeys: (itemOptions || []).map((option) => option.option_key ?? option.ad_key),
        correctKey: correctKey(item),
      });
      if (!isC1Example) number += 1;
    });
  };

  const titleMatching = (isC1(level) ? parts.cloze_matching : parts.reading_title_matching) || {};
  if (isC1(level)) {
    const matchingOptions = titleMatching.options || [];
    add("cloze_matching", "Lesen · Teil 1", "reading", titleMatching.blank_answers || [],
      (item) => {
        const isExampleBlank = Number(item.blank_number) === 0 || item.blank_key === "blank_0";
        return matchingOptions.filter((option) => (String(option.option_key || "").toLowerCase() === "beispiel") === isExampleBlank);
      }, (item) => item.correct_option?.option_key);
    const adMatching = parts.reading_ad_matching || {};
    add("reading_ad_matching", "Lesen · Teil 2", "reading", adMatching.items || [], adMatching.ads || [], (item) => item.correct_ad?.ad_key);
    const understanding = parts.reading_understanding || {};
    add("reading_understanding", "Lesen · Teil 3", "reading", understanding.questions || [],
      (item) => item.answer_options || [], (item) => item.answer_options?.find((option) => option.is_correct)?.option_key);
  } else {
    add("reading_title_matching", "Lesen · Teil 1", "reading", titleMatching.items || [],
      titleMatching.options || [], (item) => item.correct_option?.option_key);
    const understanding = parts.reading_understanding || {};
    add("reading_understanding", "Lesen · Teil 2", "reading", understanding.questions || [],
      (item) => item.answer_options || [], (item) => item.answer_options?.find((option) => option.is_correct)?.option_key);
    const adMatching = parts.reading_ad_matching || {};
    add("reading_ad_matching", "Lesen · Teil 3", "reading", adMatching.items || [],
      adMatching.ads || [], (item) => item.correct_ad?.ad_key);
  }
  const clozeChoice = parts.cloze_choice || {};
  add("cloze_choice", "Sprachbausteine · Teil 1", "reading", clozeChoice.blanks || [],
    (item) => item.options || [], (item) => item.options?.find((option) => option.is_correct)?.option_key);
  if (!isC1(level)) {
    const clozeMatching = parts.cloze_matching || {};
    add("cloze_matching", "Sprachbausteine · Teil 2", "reading", clozeMatching.blank_answers || [],
      clozeMatching.options || [], (item) => item.correct_option?.option_key);
  }
  examPartKeys(level, "listening").forEach((partKey, index) => {
    const listening = parts[partKey] || {};
    const questions = isC1(level) ? listeningQuestions(listening, listening.content?.format, true) : listening.questions || [];
    if (isC1(level) && partKey === "listening_teil1" && listening.content?.format === "speaker_matching") {
      const rows = buildSpeakerMatchingRows(listening).map((row) => ({
        ...row.question,
        statement_options: row.statements.map((statement) => ({
          option_key: statement.key,
          option_text: statement.text,
        })),
        correct_statement_key: row.correctStatementKey,
      }));
      add(partKey, "Hören · Teil 1", "listening", rows,
        (item) => item.statement_options, (item) => item.correct_statement_key, 47);
      return;
    }
    add(partKey, `Hören · Teil ${index + 1}`, "listening", questions,
      (item) => item.answer_options || [], (item) => item.answer_options?.find((option) => option.is_correct)?.option_key,
      isC1(level) ? [47, 55, 65][index] : null);
  });
  return rows;
}

function persistedExamScope(value, fallback) {
  const candidate = value?.exam || value;
  const level = candidate?.level || value?.level || fallback?.level;
  const examType = String(candidate?.exam_type || value?.exam_type || fallback?.examType || "TELC").toUpperCase();
  if (examType !== "TELC") return fallback || { examType: "TELC", level: "B1", levelPath: "b1" };
  return examPreparationScope(level) || fallback || { examType: "TELC", level: "B1", levelPath: "b1" };
}

export default function TelcMockExamPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { level: routeLevel } = useParams();
  const routeScope = useMemo(() => examPreparationScope(routeLevel) || examPreparationScope("B1"), [routeLevel]);
  const [persistedScope, setPersistedScope] = useState(null);
  const currentScope = persistedScope || routeScope;
  const sessionKey = mockExamSessionKey(user?.id, currentScope);
  const activeAttemptKey = activeMockExamKey(user?.id, currentScope);
  const routeSessionKey = mockExamSessionKey(user?.id, routeScope);
  const routeActiveAttemptKey = activeMockExamKey(user?.id, routeScope);
  const levelHomePath = `/modules/exam-preparation/${currentScope.levelPath}`;
  const mockExamPath = `/modules/exam-preparation/telc/${currentScope.levelPath}/mock-exam`;
  const [searchParams] = useSearchParams();
  const savedExamParam = searchParams.get("saved") || "";
  const attemptParam = searchParams.get("attempt") || "";
  const audioRef = useRef(null);
  const exercisePartRef = useRef(null);
  const teil2CompletedPlaysRef = useRef(0);
  const createRequestIdRef = useRef(createRequestId());
  const submissionStartedRef = useRef(false);
  const playRequestRef = useRef(false);
  const playRetryTokenRef = useRef(0);
  const hasStartedCurrentAudioRef = useRef(false);
  const awaitingAudioGestureRef = useRef(false);
  const streamRetriedRef = useRef(false);
  const recoveryPositionRef = useRef(0);
  const pausedListeningRemainingRef = useRef(null);
  const [exam, setExam] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [activePart, setActivePart] = useState(() => examPartKeys(routeScope.level, "reading")[0]);
  const [answers, setAnswers] = useState({});
  const [writingText, setWritingText] = useState("");
  const [writingChoiceId, setWritingChoiceId] = useState(null);
  const [writingAssessment, setWritingAssessment] = useState(() => ({ ...EMPTY_WRITING_ASSESSMENT }));
  const [audioStep, setAudioStep] = useState(0);
  const [audioStepStartedAt, setAudioStepStartedAt] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioBuffering, setAudioBuffering] = useState(false);
  const [audioPlaybackState, setAudioPlaybackState] = useState("idle");
  const [audioMode, setAudioMode] = useState("stream");
  const [audioProgress, setAudioProgress] = useState({ currentTime: 0, duration: 0 });
  const [listeningRemainingMs, setListeningRemainingMs] = useState(null);
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
  const writingOptions = exam?.parts?.writing_options || [];
  const hasWritingChooser = ["B2", "C1"].includes(String(currentScope.level || "").toUpperCase()) && writingOptions.length === 2;
  const hasWritingChoiceId = writingChoiceId !== null && writingChoiceId !== undefined && writingChoiceId !== "";
  const matchedWritingExercise = hasWritingChoiceId
    ? writingOptions.find((candidate) => String(candidate.id) === String(writingChoiceId)) || null
    : null;
  const hasWritingChoice = hasWritingChooser ? Boolean(matchedWritingExercise) : Boolean(exam?.parts?.writing);
  const writingReady = Boolean(exam?.parts?.writing) && (!hasWritingChooser || hasWritingChoice);
  const writingChoiceIdForProgress = hasWritingChoice ? writingChoiceId : null;
  const audioSequence = useMemo(() => isC1(currentScope.level) ? C1_AUDIO_SEQUENCE : audioSequenceForLevel(currentScope.level), [currentScope.level]);
  const currentAudioAction = audioSequence[audioStep] || null;
  const currentAudioExercise = currentAudioAction?.kind === "audio" ? exam?.parts?.[currentAudioAction.partKey] : null;
  const currentAudioUrl = currentAudioExercise?.audio_file_url || "";
  const listeningAudioUrls = useMemo(() => ["reading", "collection", "listening"].includes(phase)
    ? examPartKeys(currentScope.level, "listening").map((partKey) => exam?.parts?.[partKey]?.audio_file_url).filter(Boolean)
    : [], [exam, phase, currentScope.level]);
  const { sources: audioSources, statuses: audioStatuses } = useReliableAudioSources(listeningAudioUrls);
  const currentBackupAudioSource = audioSources[currentAudioUrl] || "";
  const currentBackupAudioStatus = currentAudioUrl ? (audioStatuses[currentAudioUrl] || "loading") : "error";
  const currentAudioSource = audioMode === "blob" ? currentBackupAudioSource : currentAudioUrl;

  const persist = useCallback((next = {}) => {
    const snapshot = { exam, phase, deadline, activePart, answers, writingText, writingChoiceId, writingAssessment, audioStep, audioStepStartedAt, listeningRemainingMs, attemptId, isFavorite, wasEarlySubmitted, ...next };
    if (snapshot.exam) {
      const serialized = JSON.stringify(snapshot);
      try { sessionStorage.setItem(sessionKey, serialized); } catch { /* best effort */ }
      try { localStorage.setItem(sessionKey, serialized); } catch { /* best effort */ }
    }
  }, [exam, phase, deadline, activePart, answers, writingText, writingChoiceId, writingAssessment, audioStep, audioStepStartedAt, listeningRemainingMs, attemptId, isFavorite, wasEarlySubmitted, sessionKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (savedExamParam) {
        try {
          setPhase("loading"); setErrorText("");
          const saved = await fetchSavedMockExam(savedExamParam);
          if (cancelled) return;
          const savedWritingChoiceId = saved.progress?.writing_choice_id ?? null;
          const savedScope = persistedExamScope(saved, routeScope);
          setPersistedScope(savedScope);
          setExam(canonicalizeWritingChoice(isC1(savedScope.level) ? c1ExamParts(saved.exam) : saved.exam, savedWritingChoiceId)); setAnswers(saved.answers || {}); setWritingText(saved.writing_text || "");
          setWritingChoiceId(savedWritingChoiceId);
          setWritingAssessment(normalizeWritingAssessment(saved.writing_assessment, saved.writing_grade));
          setAttemptId(saved.id); setIsFavorite(saved.is_favorite); setIsSavedReview(true);
          setWasEarlySubmitted(!!saved.progress?.early_submitted);
          setPhase("results"); setDeadline(0); setActivePart(examPartKeys(savedScope.level, "reading")[0]); setNow(Date.now());
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
          const savedScope = persistedExamScope(saved, routeScope);
          setPersistedScope(savedScope);
          const progress = saved.progress || {};
          setExam(canonicalizeWritingChoice(isC1(savedScope.level) ? c1ExamParts(saved.exam) : saved.exam, progress.writing_choice_id ?? null)); setAnswers(saved.answers || {}); setWritingText(saved.writing_text || "");
          setWritingChoiceId(progress.writing_choice_id ?? null);
          setWritingAssessment(normalizeWritingAssessment(saved.writing_assessment, saved.writing_grade));
          setAttemptId(saved.id); setIsFavorite(!!saved.is_favorite);
          setPhase(progress.phase || "reading"); setDeadline(Number(progress.deadline) || Date.now());
          setActivePart(activePartForScope(savedScope.level, progress.active_part)); setAudioStep(Number(progress.audio_step) || 0);
          setAudioStepStartedAt(Number(progress.audio_step_started_at) || Date.now()); setNow(Date.now());
          setListeningRemainingMs(Number(progress.listening_remaining_ms) || null);
          setWasEarlySubmitted(!!progress.early_submitted);
          setIsSavedReview(false); localStorage.setItem(activeMockExamKey(user?.id, savedScope), String(saved.id));
          return;
        } catch (error) {
          if (!cancelled) {
            setPhase("error");
            setErrorText(error?.data?.message || "考试记录加载失败或其中的题目已不存在。");
          }
          return;
        }
      }
      const stored = sessionStorage.getItem(routeSessionKey) || localStorage.getItem(routeSessionKey);
      if (stored && loadKey === 0) {
        try {
          const restored = JSON.parse(stored);
          if (restored?.exam && restored?.phase) {
            const restoredWritingChoiceId = restored.writingChoiceId ?? null;
            setPersistedScope(persistedExamScope(restored.exam, routeScope));
            const restoredScope = persistedExamScope(restored.exam, routeScope);
            setExam(canonicalizeWritingChoice(isC1(restoredScope.level) ? c1ExamParts(restored.exam) : restored.exam, restoredWritingChoiceId)); setPhase(restored.phase); setDeadline(restored.deadline || 0);
            setNow(Date.now());
            setActivePart(activePartForScope(restoredScope.level, restored.activePart)); setAnswers(restored.answers || {});
            setWritingText(restored.writingText || "");
            setWritingChoiceId(restoredWritingChoiceId);
            setWritingAssessment(normalizeWritingAssessment(restored.writingAssessment, restored.writingGrade));
            setAudioStep(restored.audioStep || 0); setAudioStepStartedAt(restored.audioStepStartedAt || Date.now());
            setListeningRemainingMs(Number(restored.listeningRemainingMs) || null);
            setWasEarlySubmitted(!!restored.wasEarlySubmitted);
            setAttemptId(restored.attemptId || restored.savedExamId || null); setIsFavorite(!!restored.isFavorite); setIsSavedReview(false);
            return;
          }
        } catch {
          sessionStorage.removeItem(routeSessionKey);
          localStorage.removeItem(routeSessionKey);
        }
      }
      const activeAttemptId = localStorage.getItem(routeActiveAttemptKey);
      if (activeAttemptId && loadKey === 0) {
        try {
          const saved = await fetchSavedMockExam(activeAttemptId);
          if (cancelled) return;
          const savedScope = persistedExamScope(saved, routeScope);
          const savedActiveAttemptKey = activeMockExamKey(user?.id, savedScope);
          if (routeActiveAttemptKey !== savedActiveAttemptKey) {
            localStorage.removeItem(routeActiveAttemptKey);
          }
          localStorage.setItem(savedActiveAttemptKey, String(saved.id));
          setPersistedScope(savedScope);
          const progress = saved.progress || {};
          setExam(canonicalizeWritingChoice(isC1(savedScope.level) ? c1ExamParts(saved.exam) : saved.exam, progress.writing_choice_id ?? null)); setAnswers(saved.answers || {}); setWritingText(saved.writing_text || "");
          setWritingChoiceId(progress.writing_choice_id ?? null);
          setWritingAssessment(normalizeWritingAssessment(saved.writing_assessment, saved.writing_grade));
          setAttemptId(saved.id); setIsFavorite(!!saved.is_favorite);
          setPhase(progress.phase || "reading"); setDeadline(Number(progress.deadline) || Date.now());
          setActivePart(activePartForScope(savedScope.level, progress.active_part)); setAudioStep(Number(progress.audio_step) || 0);
          setAudioStepStartedAt(Number(progress.audio_step_started_at) || Date.now()); setNow(Date.now());
          setListeningRemainingMs(Number(progress.listening_remaining_ms) || null);
          setWasEarlySubmitted(!!progress.early_submitted); setIsSavedReview(false);
          return;
        } catch {
          localStorage.removeItem(routeActiveAttemptKey);
        }
      }
      try {
        setPhase("loading"); setErrorText("");
        const data = await createMockExam(createRequestIdRef.current, routeScope);
        if (cancelled) return;
        const createdScope = persistedExamScope(data, routeScope);
        setPersistedScope(createdScope);
        const progress = data.progress || {};
        const normalizedExam = isC1(createdScope.level) ? c1ExamParts(data) : data;
        const nextDeadline = Number(progress.deadline) || Date.now() + examDuration(createdScope.level, "reading") * 1000;
        setNow(Date.now());
        setExam(normalizedExam); setPhase("reading"); setDeadline(nextDeadline); setActivePart(examPartKeys(createdScope.level, "reading")[0]);
        setAnswers({}); setWritingText(""); setWritingChoiceId(null); setWritingAssessment({ ...EMPTY_WRITING_ASSESSMENT });
        setAudioStep(0); setAudioStepStartedAt(0); setWasEarlySubmitted(false);
        setListeningRemainingMs(null);
        setAttemptId(data.attempt_id); setIsFavorite(false); setIsSavedReview(false); setFavoriteMessage("");
        clearAnnotationScope(mockAnnotationScope(data.attempt_id));
        localStorage.setItem(activeMockExamKey(user?.id, createdScope), String(data.attempt_id));
        const initialSnapshot = JSON.stringify({ exam: normalizedExam, phase: "reading", deadline: nextDeadline,
          activePart: READING_PART_KEYS[0], answers: {}, writingText: "",
          writingChoiceId: null, writingAssessment: { ...EMPTY_WRITING_ASSESSMENT }, audioStep: 0,
          audioStepStartedAt: 0, listeningRemainingMs: null, attemptId: data.attempt_id, isFavorite: false, wasEarlySubmitted: false });
        const createdSessionKey = mockExamSessionKey(user?.id, createdScope);
        sessionStorage.setItem(createdSessionKey, initialSnapshot);
        localStorage.setItem(createdSessionKey, initialSnapshot);
      } catch (error) {
        if (!cancelled) {
          setPhase("error");
          setErrorText(error?.status === 403 ? "笔试模拟仅对已购买备考季的用户开放。" : (error?.data?.message || "暂时无法生成模拟试卷。"));
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [loadKey, savedExamParam, attemptParam, routeSessionKey, routeActiveAttemptKey, routeScope, user?.id]);

  useEffect(() => {
    if (["loading", "error", "results"].includes(phase)) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!exam || isSavedReview) return;
    persist();
  }, [exam, phase, deadline, activePart, answers, writingText, writingChoiceId, writingAssessment, audioStep, audioStepStartedAt, listeningRemainingMs, attemptId, isFavorite, wasEarlySubmitted, isSavedReview, persist]);

  useEffect(() => {
    if (!attemptId || isSavedReview || submissionStartedRef.current) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        await updateSavedMockExam(attemptId, {
          answers,
          writing_text: writingText,
          writing_assessment: writingAssessment,
          is_favorite: isFavorite,
          progress: { phase, deadline, active_part: activePart, audio_step: audioStep, audio_step_started_at: audioStepStartedAt, listening_remaining_ms: listeningRemainingMs, early_submitted: wasEarlySubmitted, writing_choice_id: writingChoiceIdForProgress },
        });
      } catch {
        if (!submissionStartedRef.current) {
          setFavoriteMessage("考试进度保存失败，请检查网络后继续");
        }
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [attemptId, isSavedReview, answers, writingText, writingAssessment, writingChoiceIdForProgress, phase, deadline, activePart, audioStep, audioStepStartedAt, listeningRemainingMs, isFavorite, wasEarlySubmitted]);

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
    const startedAt = Date.now();
    const listeningSeconds = examDuration(currentScope.level, "listening");
    teil2CompletedPlaysRef.current = 0;
    setPhase("listening"); setDeadline(0); setListeningRemainingMs(listeningSeconds * 1000); setActivePart(examPartKeys(currentScope.level, "listening")[0]);
    setAudioStep(0); setAudioStepStartedAt(startedAt); setNeedsAudioGesture(false);
    persist({ phase: "listening", deadline: 0, listeningRemainingMs: listeningSeconds * 1000, activePart: examPartKeys(currentScope.level, "listening")[0], audioStep: 0, audioStepStartedAt: startedAt });
  }, [persist, currentScope.level]);

  const enterWriting = useCallback(() => {
    const nextDeadline = Date.now() + examDuration(currentScope.level, "writing") * 1000;
    setPhase("writing"); setDeadline(nextDeadline); setListeningRemainingMs(null); setActivePart("writing");
    audioRef.current?.pause();
    persist({ phase: "writing", deadline: nextDeadline, activePart: "writing" });
  }, [persist, currentScope.level]);

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

  const pauseListeningCountdown = useCallback(() => {
    if (phase !== "listening") return null;
    const remaining = listeningRemainingMs ?? (deadline > 0
      ? Math.max(0, deadline - Date.now())
      : examDuration(currentScope.level, "listening") * 1000);
    if (deadline > 0) {
      setDeadline(0);
      setListeningRemainingMs(remaining);
      persist({ deadline: 0, listeningRemainingMs: remaining });
    }
    return remaining;
  }, [phase, listeningRemainingMs, deadline, persist, currentScope.level]);

  const resumeListeningCountdown = useCallback((remainingOverride) => {
    if (phase !== "listening" || (remainingOverride == null && deadline > 0)) return;
    const remaining = remainingOverride ?? listeningRemainingMs ?? examDuration(currentScope.level, "listening") * 1000;
    const nextDeadline = Date.now() + remaining;
    setListeningRemainingMs(null);
    setDeadline(nextDeadline);
    persist({ deadline: nextDeadline, listeningRemainingMs: null });
  }, [phase, deadline, listeningRemainingMs, persist, currentScope.level]);

  const recoverCurrentAudio = useCallback(async (error, pausedRemaining) => {
    const element = audioRef.current;
    if (!element || error?.name === "NotAllowedError") return;
    const token = playRetryTokenRef.current;
    pausedListeningRemainingRef.current = pausedRemaining ?? pauseListeningCountdown();
    recoveryPositionRef.current = Number.isFinite(element.currentTime) ? element.currentTime : 0;
    hasStartedCurrentAudioRef.current = false;
    setAudioPlaying(false);
    if (audioMode === "stream" && !streamRetriedRef.current) {
      streamRetriedRef.current = true;
      setAudioPlaybackState("recovering");
      element.load();
      try { element.currentTime = recoveryPositionRef.current; } catch { /* restore on canplay */ }
      try {
        await element.play();
        if (token !== playRetryTokenRef.current) return;
        awaitingAudioGestureRef.current = false;
        setNeedsAudioGesture(false);
        setAudioPlaybackState("playing");
        hasStartedCurrentAudioRef.current = true;
        resumeListeningCountdown(pausedListeningRemainingRef.current);
        pausedListeningRemainingRef.current = null;
        return;
      } catch (retryError) {
        if (token !== playRetryTokenRef.current) return;
        if (retryError?.name === "NotAllowedError") {
          awaitingAudioGestureRef.current = true;
          setNeedsAudioGesture(true);
          setAudioPlaybackState("gesture");
          resumeListeningCountdown(pausedListeningRemainingRef.current);
          pausedListeningRemainingRef.current = null;
          return;
        }
      }
    }
    if (audioMode === "blob") {
      setAudioPlaybackState("error");
      return;
    }
    setAudioPlaybackState(currentBackupAudioStatus === "error" ? "error" : "switching");
    if (currentBackupAudioStatus === "ready") setAudioMode("blob");
  }, [audioMode, currentBackupAudioStatus, pauseListeningCountdown, resumeListeningCountdown]);

  const playCurrentAudio = useCallback(async (manual = false) => {
    const element = audioRef.current;
    if (!element || !currentAudioSource || playRequestRef.current || hasStartedCurrentAudioRef.current
      || (awaitingAudioGestureRef.current && !manual)) return;
    const token = ++playRetryTokenRef.current;
    const pausedRemaining = pauseListeningCountdown();
    pausedListeningRemainingRef.current = pausedRemaining;
    playRequestRef.current = true;
    setAudioPlaybackState("starting");
    try {
      if (audioMode === "blob" && audioPlaybackState === "switching") {
        try { element.currentTime = recoveryPositionRef.current; } catch { /* restore on canplay */ }
      }
      await element.play();
      if (token !== playRetryTokenRef.current) return;
      awaitingAudioGestureRef.current = false;
      setNeedsAudioGesture(false);
      setAudioPlaybackState("playing");
      hasStartedCurrentAudioRef.current = true;
      resumeListeningCountdown(pausedRemaining);
      pausedListeningRemainingRef.current = null;
    } catch (error) {
      setAudioPlaying(false);
      if (error?.name === "NotAllowedError") {
        awaitingAudioGestureRef.current = true;
        setNeedsAudioGesture(true);
        setAudioPlaybackState("gesture");
        resumeListeningCountdown(pausedRemaining);
        pausedListeningRemainingRef.current = null;
        return;
      }
      await recoverCurrentAudio(error, pausedRemaining);
    } finally {
      if (token === playRetryTokenRef.current) playRequestRef.current = false;
    }
  }, [audioMode, audioPlaybackState, currentAudioSource, pauseListeningCountdown, recoverCurrentAudio, resumeListeningCountdown]);

  useEffect(() => {
    playRetryTokenRef.current += 1;
    playRequestRef.current = false;
    hasStartedCurrentAudioRef.current = false;
    awaitingAudioGestureRef.current = false;
    streamRetriedRef.current = false;
    recoveryPositionRef.current = 0;
    pausedListeningRemainingRef.current = null;
    setAudioMode("stream");
    setAudioBuffering(false);
    setAudioProgress({ currentTime: 0, duration: 0 });
    setNeedsAudioGesture(false);
    setAudioPlaybackState(currentAudioUrl ? "starting" : "idle");
    return () => {
      playRetryTokenRef.current += 1;
      playRequestRef.current = false;
    };
  }, [currentAudioUrl]);

  useEffect(() => {
    if (phase === "listening") return;
    playRetryTokenRef.current += 1;
    playRequestRef.current = false;
    awaitingAudioGestureRef.current = false;
  }, [phase]);

  useEffect(() => {
    if (audioPlaybackState === "switching" && currentBackupAudioStatus === "ready") {
      setAudioMode("blob");
    } else if (audioPlaybackState === "switching" && currentBackupAudioStatus === "error") {
      setAudioPlaybackState("error");
    }
  }, [audioPlaybackState, currentBackupAudioStatus]);

  useEffect(() => {
    if (audioMode !== "blob" || audioPlaybackState !== "switching" || !audioRef.current) return;
    try { audioRef.current.currentTime = recoveryPositionRef.current; } catch { /* restore on canplay */ }
    playCurrentAudio();
  }, [audioMode, audioPlaybackState, playCurrentAudio]);

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
        progress: { phase, deadline, active_part: activePart, audio_step: nextStep, audio_step_started_at: startedAt, listening_remaining_ms: listeningRemainingMs, writing_choice_id: writingChoiceIdForProgress },
      }).catch(() => setFavoriteMessage("听力播放进度保存失败，请检查网络"));
    }
  }, [audioStep, persist, attemptId, isSavedReview, answers, writingText, writingAssessment, writingChoiceIdForProgress, isFavorite, phase, deadline, activePart, listeningRemainingMs]);

  const handleAudioEnded = useCallback(async (event) => {
    const audioElement = event.currentTarget;
    setAudioPlaying(false);
    await playAudioCompletionSignal();
    const completedPlays = teil2CompletedPlaysRef.current + 1;
    if (currentAudioAction?.kind === "audio" && completedPlays < (currentAudioAction.playCount || 1)) {
      teil2CompletedPlaysRef.current = completedPlays;
      audioElement.currentTime = 0;
      hasStartedCurrentAudioRef.current = false;
      await playCurrentAudio();
      return;
    }

    teil2CompletedPlaysRef.current = 0;
    advanceAudioStep();
  }, [currentAudioAction, advanceAudioStep, playCurrentAudio]);

  useEffect(() => {
    if (phase !== "listening" || !currentAudioAction) return undefined;
    if (currentAudioAction.kind === "audio") {
      const frame = window.requestAnimationFrame(() => {
        setActivePart(currentAudioAction.partKey);
        playCurrentAudio();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const remaining = Math.max(0, (currentAudioAction.durationSeconds || COLLECTION_SECONDS) * 1000 - (Date.now() - audioStepStartedAt));
    const timer = window.setTimeout(advanceAudioStep, remaining);
    return () => window.clearTimeout(timer);
  }, [phase, currentAudioAction, audioStepStartedAt, playCurrentAudio, advanceAudioStep]);

  function setAnswer(key, value) { setAnswers((previous) => ({ ...previous, [key]: value })); }
  function chooseWritingExercise(exercise) {
    if (!hasWritingChooser || hasWritingChoice || !exercise?.id) return;
    const nextExam = canonicalizeWritingChoice(exam, exercise.id);
    if (nextExam === exam) return;
    setWritingChoiceId(exercise.id);
    setExam(nextExam);
    setActivePart("writing");
    persist({ exam: nextExam, writingChoiceId: exercise.id, activePart: "writing" });
  }
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
    if (attemptId) clearAnnotationScope(mockAnnotationScope(attemptId));
    audioRef.current?.pause();
    setNeedsAudioGesture(false);
    setWritingAssessment(finalWritingAssessment);
    setWasEarlySubmitted(earlySubmitted);
    setResultModalOpen(true);
    setPhase("results"); setDeadline(0); setActivePart(examPartKeys(currentScope.level, "reading")[0]);
    persist({
      phase: "results",
      deadline: 0,
      activePart: examPartKeys(currentScope.level, "reading")[0],
      writingAssessment: finalWritingAssessment,
      wasEarlySubmitted: earlySubmitted,
    });
    if (attemptId && !isSavedReview) {
      try {
        await submitSavedMockExam(attemptId, {
          answers, writing_text: writingText, writing_assessment: finalWritingAssessment,
          is_favorite: isFavorite,
          progress: { phase: "results", deadline: 0, active_part: examPartKeys(currentScope.level, "reading")[0], audio_step: audioStep, audio_step_started_at: audioStepStartedAt, early_submitted: earlySubmitted, writing_choice_id: writingChoiceIdForProgress },
        });
        const completed = await fetchSavedMockExam(attemptId);
        if (completed?.is_completed && completed?.exam) {
          setExam(canonicalizeWritingChoice(isC1(currentScope.level) ? c1ExamParts(completed.exam) : completed.exam, writingChoiceIdForProgress));
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
    if (attemptId) clearAnnotationScope(mockAnnotationScope(attemptId));
    sessionStorage.removeItem(sessionKey); localStorage.removeItem(sessionKey); localStorage.removeItem(activeAttemptKey);
    setExam(null); setAttemptId(null); setIsFavorite(false); setIsSavedReview(false); setWasEarlySubmitted(false); setWritingChoiceId(null);
    createRequestIdRef.current = createRequestId();
    if (savedExamParam || attemptParam) navigate(mockExamPath, { replace: true });
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
        if (!nextFavorite && isSavedReview) navigate(levelHomePath, { replace: true });
        return;
      }
      if (isFavorite) {
        setIsFavorite(false);
        setFavoriteMessage("已取消收藏");
        if (isSavedReview) navigate(levelHomePath, { replace: true });
        return;
      }
      const exerciseSelection = exam.selection || Object.fromEntries(
        Object.entries(exam.parts || {}).map(([key, exercise]) => [key, exercise.id])
      );
      const saved = await saveMockExam({
        exam_type: currentScope.examType,
        level: currentScope.level,
        exercise_selection: exerciseSelection,
        answers,
        writing_text: writingText,
        writing_assessment: writingAssessment,
        is_completed: phase === "results",
        is_favorite: true,
        progress: { phase, deadline, active_part: activePart, audio_step: audioStep, audio_step_started_at: audioStepStartedAt, listening_remaining_ms: listeningRemainingMs, early_submitted: wasEarlySubmitted, writing_choice_id: writingChoiceIdForProgress },
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
    const item = config && exercise ? config.items(exercise).find((candidate) => candidate.id === itemId) : null;
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

  const remainingSeconds = Math.max(0, Math.ceil((phase === "listening" && deadline === 0 && listeningRemainingMs != null
    ? listeningRemainingMs
    : deadline - now) / 1000));
  const scores = useMemo(() => {
    if (!exam) return null;
    const readingKeys = examPartKeys(currentScope.level, "reading");
    const listeningKeys = examPartKeys(currentScope.level, "listening");
    if (isC1(currentScope.level)) {
      const readingCorrect = correctCount(exam.parts, answers, readingKeys.slice(0, 3), currentScope.level);
      const clozeCorrect = correctCount(exam.parts, answers, readingKeys.slice(3), currentScope.level);
      const listeningTeil1Correct = correctCount(exam.parts, answers, listeningKeys.slice(0, 1), currentScope.level);
      const listeningOtherCorrect = correctCount(exam.parts, answers, listeningKeys.slice(1), currentScope.level);
      const listeningCorrect = listeningTeil1Correct + listeningOtherCorrect;
      const reading = readingCorrect * 2;
      const cloze = clozeCorrect;
      const listening = listeningTeil1Correct + listeningOtherCorrect * 2;
      const writing = Math.round((writingAssessmentScore(writingAssessment) * 48 / 45) * 100) / 100;
      const raw = reading + cloze + listening + writing;
      const percentage = Math.round((raw / 166) * 1000) / 10;
      return { readingCorrect, clozeCorrect, listeningCorrect, reading, cloze, listening, writing, raw,
        percentage, passed: raw >= 99.6 };
    }
    const readingCorrect = correctCount(exam.parts, answers, readingKeys.slice(0, 3), currentScope.level);
    const clozeCorrect = correctCount(exam.parts, answers, readingKeys.slice(3), currentScope.level);
    const listeningCorrect = correctCount(exam.parts, answers, listeningKeys, currentScope.level);
    const writing = writingAssessmentScore(writingAssessment);
    const raw = readingCorrect * 3.75 + clozeCorrect * 1.5 + listeningCorrect * 3.75 + writing;
    const percentage = Math.round((raw / 225) * 1000) / 10;
    return { readingCorrect, clozeCorrect, listeningCorrect, reading: readingCorrect * 3.75,
      cloze: clozeCorrect * 1.5, listening: listeningCorrect * 3.75, writing, raw,
      percentage, passed: raw >= 135 };
  }, [exam, answers, writingAssessment, currentScope.level]);
  const answerSheetRows = useMemo(() => buildAnswerSheetRows(exam?.parts, currentScope.level).map((row) => ({
    ...row,
    editable: row.group === "reading" ? phase === "reading" : phase === "listening",
  })), [exam, phase, currentScope.level]);
  const questionNumbers = useMemo(() => Object.fromEntries(
    answerSheetRows.map((row) => [row.answerKey, row.number]),
  ), [answerSheetRows]);
  const annotationScope = attemptId && !isSavedReview && phase !== "results"
    ? mockAnnotationScope(attemptId)
    : null;

  if (phase === "loading") return <div className="telc-mock-exam-state"><span className="telc-mock-exam-spinner" /><h1>正在准备模拟考试…</h1></div>;
  if (phase === "error") return <div className="telc-mock-exam-state"><h1>暂时无法开始</h1><p>{errorText}</p><Link to={examPreparationPurchasePath(currentScope)} className="telc-mock-exam-primary">购买以解锁</Link><Link to={levelHomePath}>返回备考季</Link></div>;
  if (!exam) return null;

  let phaseContent;
  if (phase === "collection") {
    phaseContent = <div className="telc-mock-exam-state telc-mock-exam-state--collection"><span className="telc-mock-exam-kicker">第一部分已收卷</span><h1>答案已锁定</h1><p>听力考试将在倒计时结束后自动开始，请准备好耳机并保持页面开启。</p><div className="telc-mock-exam-collection-timer"><strong className="telc-mock-exam-big-time">{formatTime(remainingSeconds)}</strong><button className="telc-mock-exam-submit-early" onClick={submitExamEarly}>提前交卷</button></div><button className="telc-mock-exam-primary" onClick={enterListening}>立即进入听力</button></div>;
  } else if (phase === "writing_review") {
    const example = exam.parts.writing?.example_texts?.[0];
    const c1Quotes = exam.parts.writing?.quotes || c1WritingContent(exam.parts.writing).quotes || [];
    const c1VocabularyPages = exam.parts.writing?.vocabulary_pages || c1WritingContent(exam.parts.writing).vocabulary_pages || [];
    const unselectedWriting = hasWritingChooser && !hasWritingChoice;
    const assessmentComplete = unselectedWriting || (writingReady && isWritingAssessmentComplete(writingAssessment));
    phaseContent = (
      <div className="telc-mock-exam-review-backdrop" role="dialog" aria-modal="true" aria-labelledby="writing-review-title">
        <section className="telc-mock-exam-writing-review">
          <div className="telc-mock-exam-writing-review__body">
            <div className="telc-mock-exam-writing-review__head"><div><span>Schreiben · 自评</span><h1 id="writing-review-title">对照范文评估你的写作</h1></div></div>
            {writingReady ? <>
              {isC1(currentScope.level) && (c1Quotes.length || c1VocabularyPages.length) ? <C1WritingPrompt exercise={exam.parts.writing} showHelpers /> : null}
              <div className="telc-mock-exam-writing-review__compare">
                <article><h2>Meine Antwort</h2><div>{textBlocks(writingText || "（未作答）")}</div></article>
                <article><h2>Beispieltext</h2><MockTextRegion as="div" regionId="writing:example">{textBlocks(example?.example_text || "暂无范文")}</MockTextRegion>{example?.translation_zh ? <p>{example.translation_zh}</p> : null}</article>
              </div>
              <div className="telc-mock-exam-rubric"><h2>评分方法</h2><MockTextRegion as="p" regionId="writing:assessment:instructions">{isC1(currentScope.level)
                ? "三个自评维度分别按 5、3、1、0 分计分，并按 C1 写作满分 48 分折算。主题偏离时写作计 0 分。"
                : "三个维度分别按 5、3、1、0 分计分，维度总分乘以 3，写作满分为 45 分。主题偏离时写作计 0 分。"}</MockTextRegion></div>
            </> : <div className="telc-mock-exam-writing-empty"><p>未选择写作题目</p></div>}
            {writingReady ? <fieldset className="telc-mock-exam-topic-check">
              <legend><MockTextRegion as="span" regionId="writing:assessment:topic">文章是否围绕题目要求和给定情境展开？</MockTextRegion></legend>
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
            </fieldset> : null}
            {writingReady && writingAssessment.topic_relevant === true ? <div className="telc-mock-exam-assessment-list">
              {WRITING_CRITERIA.map((criterion) => (
                <fieldset className="telc-mock-exam-grade-picker" key={criterion.key}>
                  <legend><MockTextRegion as="span" regionId={`writing:assessment:${criterion.key}:title`}>{criterion.title}</MockTextRegion></legend>
                  {Object.entries(criterion.options).map(([grade, description]) => (
                    <label key={grade} className={writingAssessment[criterion.key] === grade ? "is-selected" : ""}>
                      <input type="radio" name={`writing-${criterion.key}`} value={grade}
                        checked={writingAssessment[criterion.key] === grade}
                        onChange={() => setWritingAssessment((previous) => ({ ...previous, [criterion.key]: grade }))} />
                      <strong>{grade}</strong><span>{WRITING_GRADE_POINTS[grade]} 分</span><MockTextRegion as="p" regionId={`writing:assessment:${criterion.key}:${grade}`}>{description}</MockTextRegion>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div> : null}
          </div>
          <div className="telc-mock-exam-writing-review__actions telc-mock-exam-writing-review__actions--sticky">
            <button
              className="telc-mock-exam-writing-review__submit"
              disabled={!assessmentComplete}
              onClick={() => (unselectedWriting ? completeExam({ ...EARLY_SUBMISSION_WRITING_ASSESSMENT }, true) : finishSelfAssessment())}
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
  } else {

  const isResults = phase === "results";
  const visibleAnswerSheetRows = isResults
    ? answerSheetRows
    : answerSheetRows.filter((row) => row.group === phase);
  const visiblePartKeys = isResults ? examPartKeys(currentScope.level, "all") : phase === "reading" ? examPartKeys(currentScope.level, "reading") : phase === "listening" ? examPartKeys(currentScope.level, "listening") : ["writing"];
  const audioLocked = phase === "listening" && audioPlaying;
  const audioLoading = currentAudioAction?.kind === "audio" && (
    audioBuffering || audioPlaybackState === "starting" || audioPlaybackState === "recovering" || audioPlaybackState === "switching"
  );
  const audioFailed = currentAudioAction?.kind === "audio" && audioPlaybackState === "error";
  const partNavigationKeys = activePart === "writing"
    ? []
    : isResults
      ? examPartKeys(currentScope.level, "all").filter((key) => key !== "writing")
      : phase === "reading"
        ? examPartKeys(currentScope.level, "reading")
        : phase === "listening"
          ? examPartKeys(currentScope.level, "listening")
          : [];
  const activePartIndex = partNavigationKeys.indexOf(activePart);
  const scoreMaximum = isC1(currentScope.level) ? 166 : 225;
  const passingScore = isC1(currentScope.level) ? 99.6 : 135;
  const sectionMaximums = isC1(currentScope.level)
    ? { reading: 48, cloze: 22, listening: 48, writing: 48, readingItems: 24, clozeItems: 22, listeningItems: 28 }
    : { reading: 75, cloze: 30, listening: 75, writing: 45, readingItems: 20, clozeItems: 20, listeningItems: 20 };

  function moveToAdjacentPart(offset) {
    const nextPart = partNavigationKeys[activePartIndex + offset];
    if (!nextPart || audioLocked) return;
    setActivePart(nextPart);
    window.requestAnimationFrame(() => {
      exercisePartRef.current?.scrollIntoView?.({ block: "start" });
    });
  }

  phaseContent = (
    <div className={`telc-mock-exam-page${isResults ? " is-results" : ""}`}>
      <header className="telc-mock-exam-header">
        <div><button className="telc-mock-exam-back" onClick={() => navigate(levelHomePath)}>← 退出模拟</button><span className="telc-mock-exam-kicker">{currentScope.examType} {currentScope.level} · 笔试模拟</span><h1>{isResults ? "考试结果与答案回顾" : phase === "reading" ? "Lesen & Sprachbausteine" : phase === "listening" ? "Hören" : "Schreiben"}</h1></div>
        <div className="telc-mock-exam-header__actions">
          {isResults ? <button className={`telc-mock-exam-utility${isFavorite ? " is-favorite" : ""}`} disabled={favoritePending} onClick={toggleFavorite}>{isFavorite ? "★ 已收藏" : "☆ 收藏本卷"}</button> : null}
          {!isResults ? <div className="telc-mock-exam-timer-actions"><div className={`telc-mock-exam-timer${remainingSeconds <= 300 ? " is-urgent" : ""}`}><span>剩余时间</span><strong>{formatTime(remainingSeconds)}</strong><small>{phase === "reading" ? "90 分钟" : `${Math.round(examDuration(currentScope.level, phase === "listening" ? "listening" : "writing") / 60)} 分钟`}</small></div><button className="telc-mock-exam-submit-early" onClick={submitExamEarly}>提前交卷</button></div> : <button className="telc-mock-exam-primary" onClick={newExam}>再考一套</button>}
        </div>
      </header>
      {favoriteMessage ? <p className="telc-mock-exam-save-message" aria-live="polite">{favoriteMessage}</p> : null}

      {isResults && resultModalOpen ? (
        <div className="telc-mock-exam-result-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mock-result-title">
          <section className={`telc-mock-exam-result-modal${scores.passed ? " is-passed" : " is-failed"}`}>
            <div className="telc-mock-exam-result-celebration" aria-hidden="true">
              {scores.passed ? <><i /><i /><i /></> : null}
              <span>{scores.passed ? "✓" : "↻"}</span>
              {scores.passed ? <><i /><i /><i /></> : null}
            </div>
            <h2 id="mock-result-title">{scores.passed ? "考试通过" : "再接再厉"}</h2>
            <strong>{formatScore(scores.raw)}<small> / {scoreMaximum} 分</small></strong>
            <p>正确率 {scores.percentage.toFixed(1)}%</p>
            <p>{scores.passed ? `已达到笔试 ${formatScore(passingScore)} 分通过线。` : `本次尚未达到笔试 ${formatScore(passingScore)} 分通过线。`}</p>
            <button type="button" className="telc-mock-exam-primary" onClick={() => setResultModalOpen(false)}>查看答题详情</button>
          </section>
        </div>
      ) : null}

      {isResults ? (
        <section className="telc-mock-exam-results">
          <div className="telc-mock-exam-result-main"><span>笔试成绩</span><strong>{formatScore(scores.raw)}<small> / {scoreMaximum}</small></strong><b>{scores.passed ? "通过" : "未通过"}</b><p>正确率 {scores.percentage.toFixed(1)}%，通过线为 {formatScore(passingScore)} 分。</p></div>
          <div className="telc-mock-exam-result-grid">
            <article><span>Lesen</span><strong>{scores.reading.toFixed(2)} / {sectionMaximums.reading}</strong><small>{scores.readingCorrect} / {sectionMaximums.readingItems} 题</small></article>
            <article><span>Sprachbausteine</span><strong>{scores.cloze.toFixed(2)} / {sectionMaximums.cloze}</strong><small>{scores.clozeCorrect} / {sectionMaximums.clozeItems} 题</small></article>
            <article><span>Hören</span><strong>{scores.listening.toFixed(2)} / {sectionMaximums.listening}</strong><small>{scores.listeningCorrect} / {sectionMaximums.listeningItems} 题</small></article>
            <article><span>Schreiben</span><strong>{formatScore(scores.writing)} / {sectionMaximums.writing}</strong><small>{wasEarlySubmitted ? (writingText.trim() ? "提前交卷，按 0 分" : "未作答，按 0 分") : writingAssessment.topic_relevant === false ? "主题偏离" : "三项自评"}</small></article>
          </div>
        </section>
      ) : null}

      {phase === "listening" ? (
        <section className={`telc-mock-exam-audio-status${audioLoading ? " is-loading" : audioFailed ? " is-error" : ""}`} aria-live="polite">
          {audioLoading ? <><span className="telc-mock-exam-audio-spinner" aria-hidden="true" /><span className="telc-mock-exam-audio-status__title">{audioPlaybackState === "switching" ? "正在切换备用音频…" : audioPlaybackState === "recovering" ? "正在恢复听力播放…" : "正在加载听力音频…"}</span></> : null}
          {audioFailed ? <span className="telc-mock-exam-audio-status__error" role="alert">{AUDIO_LOAD_ERROR}</span> : null}
          {currentAudioAction?.kind === "audio" && !audioLoading && !audioFailed ? <><span className="telc-mock-exam-audio-status__title">{needsAudioGesture ? "听力音频已就绪" : `正在播放 · ${examPart(currentScope.level, currentAudioAction.partKey).title}`}</span><strong>{currentAudioAction.playbackLabel}</strong></> : currentAudioAction?.kind === "break" ? <><span>录音间隔</span><strong>{formatTime(Math.max(0, (currentAudioAction.durationSeconds || COLLECTION_SECONDS) - Math.max(0, Math.floor((now - audioStepStartedAt) / 1000))))}</strong><small>接下来：{currentAudioAction.next}</small></> : currentAudioAction?.kind !== "audio" ? <><span>录音播放完毕</span><strong>自由检查</strong><small>倒计时结束前可切换并修改答案</small></> : null}
          {needsAudioGesture ? <button onClick={() => playCurrentAudio(true)}>点击继续播放录音</button> : null}
          {currentAudioAction?.kind === "audio" ? (
            <div
              className="telc-mock-exam-audio-timeline"
              aria-live="off"
              style={{ "--telc-audio-progress": `${audioProgress.duration ? (Math.min(audioProgress.currentTime, audioProgress.duration) / audioProgress.duration) * 100 : 0}%` }}
            >
              <progress max={audioProgress.duration || 1} value={audioProgress.duration ? Math.min(audioProgress.currentTime, audioProgress.duration) : 0} aria-label="听力播放进度" />
              <div className="telc-mock-exam-audio-timeline__meta" aria-hidden="true">
                <span>{formatTime(audioProgress.currentTime)}</span>
                <span>{formatTime(audioProgress.duration)}</span>
              </div>
            </div>
          ) : null}
          <audio ref={audioRef} src={currentAudioSource || undefined} onCanPlay={(event) => {
            if (audioMode === "blob" && audioPlaybackState === "switching") event.currentTarget.currentTime = recoveryPositionRef.current;
            playCurrentAudio();
          }}
            onPlay={() => { setAudioPlaying(true); setAudioBuffering(false); setAudioPlaybackState("playing"); }} onPause={() => setAudioPlaying(false)}
            onWaiting={() => setAudioBuffering(true)} onPlaying={() => setAudioBuffering(false)}
            onError={(event) => { setAudioBuffering(false); recoverCurrentAudio(event.currentTarget.error, pausedListeningRemainingRef.current); }}
            onLoadedMetadata={(event) => { const { currentTime, duration } = event.currentTarget; setAudioProgress({ currentTime: Number.isFinite(currentTime) ? currentTime : 0, duration: Number.isFinite(duration) ? duration : 0 }); }}
            onDurationChange={(event) => { const duration = event.currentTarget.duration; setAudioProgress((previous) => ({ ...previous, duration: Number.isFinite(duration) ? duration : 0 })); }}
            onTimeUpdate={(event) => { const currentTime = event.currentTarget.currentTime; setAudioProgress((previous) => ({ ...previous, currentTime: Number.isFinite(currentTime) ? currentTime : 0 })); }}
            onLoadStart={() => { setAudioBuffering(false); setAudioProgress({ currentTime: 0, duration: 0 }); }}
            onEnded={(event) => { setAudioBuffering(false); handleAudioEnded(event); }} preload="auto" />
        </section>
      ) : null}

      <nav className="telc-mock-exam-part-nav" aria-label="考试部分">
        {visiblePartKeys.map((key) => <button key={key} className={activePart === key ? "is-active" : ""}
          disabled={audioLocked && key !== activePart} onClick={() => setActivePart(key)} aria-label={examPart(currentScope.level, key).title}>
          <span className="telc-mock-exam-part-nav__full">{examPart(currentScope.level, key).title}</span>
          <span className="telc-mock-exam-part-nav__short" aria-hidden="true">{examPart(currentScope.level, key).short}</span>
        </button>)}
      </nav>

      {activePart === "writing" && hasWritingChooser && !hasWritingChoice && !isResults ? (
        <section ref={exercisePartRef} className="telc-mock-exam-paper telc-mock-exam-writing-chooser">
          <div className="telc-mock-exam-paper__heading">
            <div><span>Schreiben</span><h2>Wählen Sie eine Aufgabe</h2></div>
            <span className="telc-mock-exam-paper__badge">{currentScope.examType} {currentScope.level}</span>
          </div>
          <p className="telc-mock-exam-writing-chooser__intro">{isC1(currentScope.level)
            ? "Wählen Sie eines der folgenden zwei Themen. Schreiben Sie einen Text, in dem Sie Ihren eigenen Standpunkt dazu erarbeiten und argumentativ darlegen. Ihr Text soll mindestens 350 Wörter umlassen. Sie haben 70 Minuten Zeit"
            : "Wählen Sie eine der beiden Schreibaufgaben. Danach können Sie die Auswahl nicht mehr ändern."}</p>
          <div className="telc-mock-exam-writing-chooser__options">
            {writingOptions.map((option, index) => (
              <article className="telc-mock-exam-writing-choice-card" key={option.id}>
                <h3>{isC1(currentScope.level) ? `Thema ${index + 1}` : option.exercise_base?.title || `Aufgabe ${index + 1}`}</h3>
                {isC1(currentScope.level) ? <div className="telc-mock-exam-writing-choice-card__c1-task">
                  <MockTextRegion as="p" regionId={`writing:choice:${option.id}:topic`}>In einer Seminararbeit sollen Sie das Thema „{option.exercise_base?.title || `Thema ${index + 1}`}“ aus unterschiedlichen Perspektiven beleuchten.</MockTextRegion>
                  <p>Sie können die unten stehenden Zitate zur Orientierung verwenden, aber auch andere Aspekte des Themas darlegen.</p>
                  <p>Argumentieren Sie überzeugend, führen Sie Beispiele an und gliedern Sie Ihren Text in Einleitung, Hauptteil und Schluss.</p>
                  <C1WritingPrompt exercise={option} showTranslations={false} />
                </div> : <div className="telc-mock-exam-source-text">
                  <h4>Aushang</h4>
                  <MockTextRegion as="p" regionId={`writing:choice:${option.id}:request`}>{textBlocks(option.request_text)}</MockTextRegion>
                  <h4>Aufgabe</h4>
                  <MockTextRegion as="p" regionId={`writing:choice:${option.id}:task`}>{textBlocks(option.task_text)}</MockTextRegion>
                </div>}
                <button type="button" className="telc-mock-exam-primary" onClick={() => chooseWritingExercise(option)}>Wählen</button>
              </article>
            ))}
          </div>
        </section>
      ) : isResults && activePart === "writing" && hasWritingChooser && !hasWritingChoice ? (
        <section ref={exercisePartRef} className="telc-mock-exam-paper telc-mock-exam-writing-empty">
          <div className="telc-mock-exam-paper__heading"><div><span>Schreiben</span><h2>写作</h2></div><span className="telc-mock-exam-paper__badge">{currentScope.examType} {currentScope.level}</span></div>
          <p>未选择写作题目</p>
        </section>
      ) : (
        <ExercisePart partKey={activePart} exercise={exam.parts[activePart]} answers={answers} setAnswer={setAnswer} setAnswers={setAnswers}
          disabled={isResults} review={isResults} writingText={writingText} setWritingText={setWritingText}
          favoriteFor={favoriteFor} questionNumbers={questionNumbers} sectionRef={exercisePartRef} examLabel={`${currentScope.examType} ${currentScope.level}`} examLevel={currentScope.level} />
      )}

      {activePartIndex >= 0 ? (
        <nav className="telc-mock-exam-bottom-nav" aria-label="前后部分导航">
          <button type="button" aria-label="上一部分" title="上一部分"
            disabled={audioLocked || activePartIndex === 0} onClick={() => moveToAdjacentPart(-1)}>←</button>
          <button type="button" aria-label="下一部分" title="下一部分"
            disabled={audioLocked || activePartIndex === partNavigationKeys.length - 1} onClick={() => moveToAdjacentPart(1)}>→</button>
        </nav>
      ) : null}

      {visibleAnswerSheetRows.length ? (
        <TelcMockExamAnswerSheet rows={visibleAnswerSheetRows} answers={answers} onAnswer={setAnswer} review={isResults} />
      ) : null}

      {!isResults ? <footer className="telc-mock-exam-footer"><div><strong>{phase === "writing" && hasWritingChooser && !hasWritingChoice ? "请先选择一道写作题" : "上交答题卡"}</strong></div>{phase === "reading" ? <button onClick={finishReadingEarly}>完成本部分，进入听力</button> : phase === "listening" ? <button onClick={finishListeningEarly}>完成本部分，进入写作</button> : hasWritingChooser && !hasWritingChoice ? null : <button onClick={submitWriting}>提交写作并自评</button>}</footer> : null}
    </div>
  );
  }

  return <ExamTextAnnotationProvider scope={annotationScope}>{phaseContent}</ExamTextAnnotationProvider>;
}
