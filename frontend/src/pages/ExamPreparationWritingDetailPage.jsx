import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import { useAuth } from "../api/auth/index.js";
import { updateMyProfile } from "../api/auth/profile.js";
import {
  fetchWritingExerciseDetail,
} from "../api/exam_preparation/writingExercises.js";
import {
  fetchWritingExerciseStates,
  fetchWritingExampleTextStates,
  saveWritingExampleTextState,
  saveWritingExerciseState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import WritingExerciseWorkspace, {
  StoredLineBreaks,
} from "../components/examPreparation/WritingExerciseWorkspace.jsx";
import {
  AnnotatableTextRegion,
  ExamTextAnnotationProvider,
  useExamTextAnnotations,
} from "../components/examPreparation/ExamTextAnnotations.jsx";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import { isTelcB2Writing, writingWordLimitLabel } from "./writingDisplay.js";
import "./ExamPreparationWritingDetailPage.css";

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

const WRITING_GUIDE_STEPS = [
  {
    title: "先阅读题目内容",
    description: "这里说明本题的写作场景。开始作答前，先确认你要写给谁，以及为什么要写。",
  },
  {
    title: "需要时开始计时",
    description: "点击“开始计时”即可模拟正式考试的时间限制。计时开始后会持续显示剩余时间。",
  },
  {
    title: "核对写作要求",
    description: "这里列出了正文必须覆盖的内容。写作时逐项回应，避免遗漏得分点。",
  },
  {
    title: "在 Meine Antwort 中作答",
    description: "把你的完整德语作文输入“我的作答”。页面会自动统计词数，完成后点击 Prüfen。",
  },
];

function WritingResetAction({ onReset }) {
  const { clearAnnotations } = useExamTextAnnotations();

  return (
    <ExamActionButton
      className="writing-detail-reset-btn"
      onClick={() => {
        onReset();
        clearAnnotations();
      }}
      label="Wiederholen"
      icon="rotate"
    />
  );
}

export default function ExamPreparationWritingDetailPage() {
  const { exerciseId } = useParams();
  const scope = examPreparationScope(useParams().level);
  const { user, reloadMe } = useAuth();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [draftText, setDraftText] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(30 * 60);
  const [timerStarted, setTimerStarted] = useState(false);
  const [submittedTimeSpentSeconds, setSubmittedTimeSpentSeconds] = useState(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [exampleFavoriteById, setExampleFavoriteById] = useState({});
  const [exampleFavoritePendingById, setExampleFavoritePendingById] = useState({});
  const [guideStep, setGuideStep] = useState(null);
  const [guidePending, setGuidePending] = useState(false);
  const [guideErrorText, setGuideErrorText] = useState("");
  const guideTargetRefs = useRef([]);
  const guideDialogRef = useRef(null);
  const guideInitializationKeyRef = useRef("");
  const isTelcB2 = isTelcB2Writing(exercise);
  const guideSeenField = isTelcB2
    ? "has_seen_b2_schreiben_guide"
    : "has_seen_schreiben_guide";

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        const detail = await fetchWritingExerciseDetail(exerciseId, scope);
        if (!aborted) {
          setExercise(detail || null);
          const timeLimitSeconds = (detail?.time_limit_minutes || 30) * 60;
          setRemainingSeconds(timeLimitSeconds);
          const stateData = await fetchWritingExerciseStates(exerciseId);
          if (aborted) {
            return;
          }
          const firstState = Array.isArray(stateData?.results) ? stateData.results[0] : null;
          if (firstState) {
            setIsFavorited(Boolean(firstState.is_favorited));
            if (typeof firstState?.answer_payload?.text === "string") {
              setDraftText(firstState.answer_payload.text);
              const restoredIsChecked = Boolean(firstState.answer_payload.is_checked);
              setIsChecked(restoredIsChecked);
              if (
                restoredIsChecked
                && Number.isInteger(firstState.time_spent_seconds)
                && firstState.time_spent_seconds >= 0
              ) {
                setSubmittedTimeSpentSeconds(firstState.time_spent_seconds);
                setRemainingSeconds(Math.max(timeLimitSeconds - firstState.time_spent_seconds, 0));
              }
            }
          }
          const exampleStateData = await fetchWritingExampleTextStates(exerciseId);
          if (aborted) {
            return;
          }
          const favoriteMap = {};
          const exampleStates = Array.isArray(exampleStateData?.results) ? exampleStateData.results : [];
          exampleStates.forEach((state) => {
            favoriteMap[state.example_text] = Boolean(state.is_favorited);
          });
          setExampleFavoriteById(favoriteMap);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "写作题目加载失败。");
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    }

    loadExercise();
    return () => {
      aborted = true;
    };
  }, [exerciseId]);

  useEffect(() => {
    if (!timerStarted || remainingSeconds <= 0) {
      return undefined;
    }
    const timerId = window.setInterval(() => {
      setRemainingSeconds((previous) => {
        if (previous <= 1) {
          window.clearInterval(timerId);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [timerStarted, remainingSeconds]);

  useEffect(() => {
    if (!exercise?.id || !user?.id) {
      return;
    }
    const initializationKey = `${user.id}:${exercise.id}`;
    if (guideInitializationKeyRef.current === initializationKey) {
      return;
    }
    guideInitializationKeyRef.current = initializationKey;
    if (!user[guideSeenField]) {
      setGuideStep(0);
    }
  }, [exercise, guideSeenField, user]);

  useEffect(() => {
    if (guideStep === null) {
      return undefined;
    }
    const frameId = window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      guideTargetRefs.current[guideStep]?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      guideDialogRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [guideStep]);

  const wordCount = useMemo(() => countWords(draftText), [draftText]);
  const wordTargetLabel = isTelcB2
    ? writingWordLimitLabel(exercise)
    : `${exercise?.words_limit || 80} 词`;
  const exampleTexts = useMemo(
    () => (Array.isArray(exercise?.example_texts) ? exercise.example_texts : []),
    [exercise]
  );
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || exercise?.id || ""}`.trim();
  }, [exercise, exerciseId]);

  async function toggleFavorite() {
    if (!exercise?.id) {
      return;
    }
    const nextValue = !isFavorited;
    setFavoritePending(true);
    try {
      await saveWritingExerciseState({
        exercise: exercise.id,
        is_favorited: nextValue,
        answer_payload: {
          text: draftText,
          is_checked: isChecked,
        },
      });
      setIsFavorited(nextValue);
    } catch (error) {
      setErrorText(error?.message || "收藏状态保存失败。");
    } finally {
      setFavoritePending(false);
    }
  }

  async function handleCheck() {
    const timeLimitSeconds = (exercise?.time_limit_minutes || 30) * 60;
    const timeSpentSeconds = Math.max(0, timeLimitSeconds - remainingSeconds);
    setTimerStarted(false);
    setSubmittedTimeSpentSeconds(timeSpentSeconds);
    setIsChecked(true);

    try {
      await saveWritingExerciseState({
        exercise: exercise.id,
        is_favorited: isFavorited,
        time_spent_seconds: timeSpentSeconds,
        answer_payload: {
          text: draftText,
          is_checked: true,
        },
      });
    } catch (error) {
      setErrorText(error?.message || "Antwort konnte nicht gespeichert werden.");
    }
  }

  async function toggleExampleFavorite(exampleId) {
    const nextValue = !exampleFavoriteById[exampleId];
    setExampleFavoritePendingById((previous) => ({ ...previous, [exampleId]: true }));
    setErrorText("");
    try {
      await saveWritingExampleTextState({
        example_text: exampleId,
        is_favorited: nextValue,
      });
      setExampleFavoriteById((previous) => ({ ...previous, [exampleId]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Beispieltext 收藏状态保存失败。");
    } finally {
      setExampleFavoritePendingById((previous) => ({ ...previous, [exampleId]: false }));
    }
  }

  async function completeWritingGuide() {
    setGuidePending(true);
    setGuideErrorText("");
    try {
      await updateMyProfile({
        [guideSeenField]: true,
      });
      setGuideStep(null);
      await reloadMe();
    } catch (error) {
      setGuideErrorText(error?.message || "引导状态保存失败，请稍后重试。");
    } finally {
      setGuidePending(false);
    }
  }

  function guideTargetClass(stepIndex) {
    return guideStep === stepIndex ? "writing-detail-guide-target" : "";
  }

  if (loading) {
    return <div className="writing-detail-page"><div className="writing-detail-shell"><p className="writing-detail-loading">写作题目加载中...</p></div></div>;
  }

  if (errorText) {
    return <div className="writing-detail-page"><div className="writing-detail-shell"><p className="writing-detail-error">{errorText}</p></div></div>;
  }

  return (
    <ExamTextAnnotationProvider
      scope={exerciseAnnotationScope(exercise.exercise_base.exercise_type, exercise.id)}
    >
      <div className="writing-detail-page">
      <div className="writing-detail-shell">
        <div className="writing-detail-topbar">
          <Link to={`/modules/exam-preparation/${scope?.levelPath || "b1"}/schreiben`} className="writing-detail-topbar__back">
            ← 返回写作模块
          </Link>
          <span className="writing-detail-topbar__meta">
            {exercise?.exercise_base?.level || scope?.level} · {exercise?.exercise_base?.external_id || exercise?.id}
          </span>
        </div>

        <section className="writing-detail-hero">
          <h1 className="writing-detail-hero__title">{heroTitle}</h1>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || scope?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="writing-detail-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="writing-detail-hero__badge writing-detail-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || scope?.level || exercise?.exercise_base?.difficulty ? (
                <span className="writing-detail-hero__badge">
                  难度：{exercise.exercise_base.level || scope?.level || exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="writing-detail-hero__badge writing-detail-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <WritingExerciseWorkspace
          exercise={exercise}
          isTelcB2={isTelcB2}
          value={draftText}
          onChange={(event) => {
            if (isChecked) {
              setIsChecked(false);
            }
            setDraftText(event.target.value);
          }}
          requestRef={(node) => { guideTargetRefs.current[0] = node; }}
          taskRef={(node) => { guideTargetRefs.current[2] = node; }}
          inputRef={(node) => { guideTargetRefs.current[3] = node; }}
          requestClassName={guideTargetClass(0)}
          taskClassName={guideTargetClass(2)}
          inputClassName={guideTargetClass(3)}
          metaPanel={(
            <section className="writing-detail-meta-panel">
              <div className="writing-detail-meta-chip">
                {isTelcB2 ? wordTargetLabel : `最多 ${wordTargetLabel}`}
              </div>
              <div className="writing-detail-meta-actions">
                {isTelcB2 ? (
                  <button
                    type="button"
                    className="writing-detail-guide-replay-btn"
                    onClick={() => {
                      setGuideErrorText("");
                      setGuideStep(0);
                    }}
                  >
                    查看引导
                  </button>
                ) : null}
                <button
                  ref={(node) => { guideTargetRefs.current[1] = node; }}
                  type="button"
                  className={["writing-detail-timer-btn", guideTargetClass(1)].filter(Boolean).join(" ")}
                  onClick={() => {
                    if (!timerStarted && remainingSeconds > 0) {
                      setTimerStarted(true);
                    }
                  }}
                  disabled={isChecked || timerStarted || remainingSeconds <= 0}
                >
                  {isChecked
                    ? submittedTimeSpentSeconds === null
                      ? "计时已结束"
                      : `用时：${formatTime(submittedTimeSpentSeconds)}`
                    : timerStarted
                      ? `计时中：${formatTime(remainingSeconds)}`
                      : `开始计时：${formatTime(remainingSeconds)}`}
                </button>
              </div>
            </section>
          )}
        />

        {isChecked ? (
          <section className="writing-detail-review-grid">
            <article className="writing-detail-review-card writing-detail-review-card--user">
              <div className="writing-detail-review-card__titleRow">
                <h2>我的作答</h2>
                <ExerciseFavoriteButton
                  isFavorited={isFavorited}
                  pending={favoritePending}
                  onClick={toggleFavorite}
                />
              </div>
              <p><StoredLineBreaks text={draftText} fallback="你还没有输入内容。" /></p>
            </article>

            {exampleTexts.map((example, index) => (
              <article key={example.id} className="writing-detail-review-card writing-detail-review-card--example">
                <div className="writing-detail-review-card__titleRow">
                  <div className="writing-detail-review-card__exampleHeading">
                    <h2>
                      {exampleTexts.length > 1 ? `Mustertext ${index + 1}` : "Mustertext"}
                    </h2>
                    {example.note ? (
                      <AnnotatableTextRegion as="span" regionId={`explanation:${example.id}`}>
                        {example.note}
                      </AnnotatableTextRegion>
                    ) : null}
                  </div>
                  <ExerciseFavoriteButton
                    isFavorited={Boolean(exampleFavoriteById[example.id])}
                    pending={Boolean(exampleFavoritePendingById[example.id])}
                    onClick={() => toggleExampleFavorite(example.id)}
                    label="收藏 Mustertext"
                  />
                </div>
                <AnnotatableTextRegion as="p" regionId={`reference-answer:${example.id}`}>
                  <StoredLineBreaks text={example.example_text} />
                </AnnotatableTextRegion>
              </article>
            ))}
          </section>
        ) : null}

        <section className={`writing-detail-actions${isTelcB2 ? " writing-detail-actions--compact" : ""}`}>
          {!isTelcB2 ? (
            <span className="writing-detail-actions__meta">
              {wordCount} / {wordTargetLabel}
            </span>
          ) : null}
          <div className="writing-detail-actions__buttons">
            <ExamActionButton
              className="writing-detail-check-btn"
              disabled={isChecked || !draftText.trim()}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <WritingResetAction
                onReset={() => {
                  setDraftText("");
                  setIsChecked(false);
                  setTimerStarted(false);
                  setSubmittedTimeSpentSeconds(null);
                  setRemainingSeconds((exercise?.time_limit_minutes || 30) * 60);
                }}
              />
            ) : null}
          </div>
        </section>
      </div>
      </div>

      {guideStep !== null ? (
        <>
          <div className="writing-detail-guide-backdrop" aria-hidden="true" />
          <section
            ref={guideDialogRef}
            className="writing-detail-guide-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="writing-detail-guide-title"
            aria-describedby="writing-detail-guide-description"
            tabIndex={-1}
          >
            <div className="writing-detail-guide-card__topline">
              <span>Schreiben · {guideStep + 1} / {WRITING_GUIDE_STEPS.length}</span>
              <button
                type="button"
                className="writing-detail-guide-card__skip"
                onClick={completeWritingGuide}
                disabled={guidePending}
              >
                跳过引导
              </button>
            </div>
            <h2 id="writing-detail-guide-title">
              {WRITING_GUIDE_STEPS[guideStep].title}
            </h2>
            <p id="writing-detail-guide-description">
              {WRITING_GUIDE_STEPS[guideStep].description}
            </p>
            {guideErrorText ? (
              <p className="writing-detail-guide-card__error">{guideErrorText}</p>
            ) : null}
            <div className="writing-detail-guide-card__actions">
              <button
                type="button"
                className="writing-detail-guide-card__back"
                onClick={() => {
                  setGuideErrorText("");
                  setGuideStep((previous) => Math.max(0, previous - 1));
                }}
                disabled={guidePending || guideStep === 0}
              >
                上一步
              </button>
              <button
                type="button"
                className="writing-detail-guide-card__next"
                onClick={() => {
                  if (guideStep >= WRITING_GUIDE_STEPS.length - 1) {
                    completeWritingGuide();
                    return;
                  }
                  setGuideErrorText("");
                  setGuideStep((previous) => previous + 1);
                }}
                disabled={guidePending}
              >
                {guideStep >= WRITING_GUIDE_STEPS.length - 1
                  ? guidePending ? "正在保存..." : "完成引导"
                  : "下一步"}
              </button>
            </div>
          </section>
        </>
      ) : null}
    </ExamTextAnnotationProvider>
  );
}
