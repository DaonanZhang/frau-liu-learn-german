import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import "./ExamPreparationWritingDetailPage.css";

function renderHyphenLineBreaks(text, fallback) {
  return String(text || fallback).split("-").map((part, index) => (
    <span key={`${index}-${part}`}>
      {index > 0 ? <><br />-</> : null}{part}
    </span>
  ));
}

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
    title: "先阅读 Anleitung",
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

export default function ExamPreparationWritingDetailPage() {
  const { exerciseId } = useParams();
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

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        const detail = await fetchWritingExerciseDetail(exerciseId);
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
    if (!user.has_seen_schreiben_guide) {
      setGuideStep(0);
    }
  }, [exercise, user]);

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
        has_seen_schreiben_guide: true,
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
    <div className="writing-detail-page">
      <div className="writing-detail-shell">
        <div className="writing-detail-topbar">
          <Link to="/modules/exam-preparation/schreiben" className="writing-detail-topbar__back">
            ← 返回写作模块
          </Link>
          <span className="writing-detail-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || exercise?.id}
          </span>
        </div>

        <section className="writing-detail-hero">
          <h1 className="writing-detail-hero__title">{heroTitle}</h1>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="writing-detail-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="writing-detail-hero__badge writing-detail-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty ? (
                <span className="writing-detail-hero__badge">
                  难度：{exercise.exercise_base.level || exercise.exercise_base.difficulty}
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

        <section
          ref={(node) => {
            guideTargetRefs.current[0] = node;
          }}
          className={[
            "writing-detail-request-panel",
            guideTargetClass(0),
          ].filter(Boolean).join(" ")}
        >
          <h2>Anleitung</h2>
          <p>{renderHyphenLineBreaks(exercise?.request_text, "请阅读题目要求并完成写作。")}</p>
        </section>

        <section className="writing-detail-meta-panel">
          <div className="writing-detail-meta-chip">
            最多 {exercise?.words_limit || 80} 词
          </div>
          <button
            ref={(node) => {
              guideTargetRefs.current[1] = node;
            }}
            type="button"
            className={[
              "writing-detail-timer-btn",
              guideTargetClass(1),
            ].filter(Boolean).join(" ")}
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
        </section>

        <section className="writing-detail-workspace">
          <article
            ref={(node) => {
              guideTargetRefs.current[2] = node;
            }}
            className={[
              "writing-detail-task-card",
              guideTargetClass(2),
            ].filter(Boolean).join(" ")}
          >
            <h2>写作要求</h2>
            <p>{renderHyphenLineBreaks(exercise?.task_text, "请根据题目要求完成写作。")}</p>
          </article>

          <article
            ref={(node) => {
              guideTargetRefs.current[3] = node;
            }}
            className={[
              "writing-detail-input-card",
              guideTargetClass(3),
            ].filter(Boolean).join(" ")}
          >
            <div className="writing-detail-input-card__header">
              <h2>我的作答</h2>
              <span>{wordCount} 词</span>
            </div>
            <textarea
              className="writing-detail-textarea"
              value={draftText}
              onChange={(event) => {
                if (isChecked) {
                  setIsChecked(false);
                }
                setDraftText(event.target.value);
              }}
              placeholder="请在这里输入你的写作内容..."
            />
          </article>
        </section>

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
              <p>{draftText || "你还没有输入内容。"}</p>
            </article>

            {exampleTexts.map((example, index) => (
              <article key={example.id} className="writing-detail-review-card writing-detail-review-card--example">
                <div className="writing-detail-review-card__titleRow">
                  <div className="writing-detail-review-card__exampleHeading">
                    <h2>
                      {exampleTexts.length > 1 ? `Mustertext ${index + 1}` : "Mustertext"}
                    </h2>
                    {example.note ? <span>{example.note}</span> : null}
                  </div>
                  <ExerciseFavoriteButton
                    isFavorited={Boolean(exampleFavoriteById[example.id])}
                    pending={Boolean(exampleFavoritePendingById[example.id])}
                    onClick={() => toggleExampleFavorite(example.id)}
                    label="收藏 Mustertext"
                  />
                </div>
                <p>{example.example_text}</p>
              </article>
            ))}
          </section>
        ) : null}

        <section className="writing-detail-actions">
          <span className="writing-detail-actions__meta">
            {wordCount} / {exercise?.words_limit || 80} 词
          </span>
          <div className="writing-detail-actions__buttons">
            <ExamActionButton
              className="writing-detail-check-btn"
              disabled={isChecked || !draftText.trim()}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="writing-detail-reset-btn"
                onClick={() => {
                  setDraftText("");
                  setIsChecked(false);
                  setTimerStarted(false);
                  setSubmittedTimeSpentSeconds(null);
                  setRemainingSeconds((exercise?.time_limit_minutes || 30) * 60);
                }}
                label="Wiederholen"
                icon="rotate"
              />
            ) : null}
          </div>
        </section>
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
    </div>
  );
}
