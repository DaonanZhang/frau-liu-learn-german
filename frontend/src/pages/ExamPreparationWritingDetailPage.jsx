import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchWritingExerciseDetail,
} from "../api/exam_preparation/writingExercises.js";
import {
  fetchWritingExerciseStates,
  saveWritingExerciseState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
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

export default function ExamPreparationWritingDetailPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [draftText, setDraftText] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(30 * 60);
  const [timerStarted, setTimerStarted] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        const detail = await fetchWritingExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          if (detail?.time_limit_minutes) {
            setRemainingSeconds(detail.time_limit_minutes * 60);
          }
          const stateData = await fetchWritingExerciseStates(exerciseId);
          if (aborted) {
            return;
          }
          const firstState = Array.isArray(stateData?.results) ? stateData.results[0] : null;
          if (firstState) {
            setIsFavorited(Boolean(firstState.is_favorited));
            if (typeof firstState?.answer_payload?.text === "string") {
              setDraftText(firstState.answer_payload.text);
              setIsChecked(true);
            }
          }
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
        },
      });
      setIsFavorited(nextValue);
    } catch (error) {
      setErrorText(error?.message || "收藏状态保存失败。");
    } finally {
      setFavoritePending(false);
    }
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
          {exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="writing-detail-hero__badges">
              {exercise?.exercise_base?.difficulty ? (
                <span className="writing-detail-hero__badge">
                  难度：{exercise.exercise_base.difficulty}
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

        <section className="writing-detail-request-panel">
          <p>{exercise?.request_text || "请阅读题目要求并完成写作。"}</p>
        </section>

        <section className="writing-detail-meta-panel">
          <div className="writing-detail-meta-chip">
            最多 {exercise?.words_limit || 80} 词
          </div>
          <button
            type="button"
            className="writing-detail-timer-btn"
            onClick={() => {
              if (!timerStarted && remainingSeconds > 0) {
                setTimerStarted(true);
              }
            }}
            disabled={timerStarted || remainingSeconds <= 0}
          >
            {timerStarted ? `计时中：${formatTime(remainingSeconds)}` : `开始计时：${formatTime(remainingSeconds)}`}
          </button>
        </section>

        <section className="writing-detail-workspace">
          <article className="writing-detail-task-card">
            <h2>写作要求</h2>
            <p>{exercise?.task_text || "请根据题目要求完成写作。"}</p>
          </article>

          <article className="writing-detail-input-card">
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

            {exampleTexts.map((example) => (
              <article key={example.id} className="writing-detail-review-card writing-detail-review-card--example">
                <div className="writing-detail-review-card__header">
                  <h2>{example.label || "示例答案"}</h2>
                  {example.note ? <span>{example.note}</span> : null}
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
              onClick={() => {
                setIsChecked(true);
              }}
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
                  setRemainingSeconds((exercise?.time_limit_minutes || 30) * 60);
                }}
                label="Wiederholen"
                icon="rotate"
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
