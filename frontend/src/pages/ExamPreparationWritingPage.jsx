import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchWritingExerciseDetail,
  fetchWritingExercises,
} from "../api/exam_preparation/writingExercises.js";
import {
  fetchWritingExerciseStates,
  saveWritingExerciseState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import "./ExamPreparationWritingPage.css";

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

export default function ExamPreparationWritingPage() {
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
        const listData = await fetchWritingExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;
        if (!firstExercise?.id) {
          throw new Error("No writing exercise found.");
        }
        const detail = await fetchWritingExerciseDetail(firstExercise.id);
        if (!aborted) {
          setExercise(detail || null);
          if (detail?.time_limit_minutes) {
            setRemainingSeconds(detail.time_limit_minutes * 60);
          }
          const stateData = await fetchWritingExerciseStates(firstExercise.id);
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
          setErrorText(error?.message || "Failed to load writing exercise.");
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
  }, []);

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
  const exampleTexts = useMemo(() => (Array.isArray(exercise?.example_texts) ? exercise.example_texts : []), [exercise]);

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
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePending(false);
    }
  }

  if (loading) {
    return <div className="writing-page"><div className="writing-shell"><p className="writing-loading">Loading writing exercise...</p></div></div>;
  }

  if (errorText) {
    return <div className="writing-page"><div className="writing-shell"><p className="writing-error">{errorText}</p></div></div>;
  }

  return (
    <div className="writing-page">
      <div className="writing-shell">
        <div className="writing-topbar">
          <Link to="/modules/exam-preparation" className="writing-topbar__back">
            ← Zurück zu Exam Preparation
          </Link>
          <span className="writing-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="writing-hero">
          <p className="writing-hero__eyebrow">WRITING_PROMPT</p>
          <h1 className="writing-hero__title">{exercise?.exercise_base?.title || "Schreiben Teil 1"}</h1>
        </section>

        <section className="writing-request-panel">
          <p>{exercise?.request_text || "Sie haben von einer Freundin folgende E-Mail erhalten: ..."}</p>
        </section>

        <section className="writing-meta-panel">
          <div className="writing-meta-chip">
            max. {exercise?.words_limit || 80} Wörter
          </div>
          <button
            type="button"
            className="writing-timer-btn"
            onClick={() => {
              if (!timerStarted && remainingSeconds > 0) {
                setTimerStarted(true);
              }
            }}
            disabled={timerStarted || remainingSeconds <= 0}
          >
            {timerStarted ? `Timer läuft: ${formatTime(remainingSeconds)}` : `Timer starten: ${formatTime(remainingSeconds)}`}
          </button>
        </section>

        <section className="writing-workspace">
          <article className="writing-task-card">
            <h2>Aufgabe</h2>
            <p>{exercise?.task_text || "Antworten Sie Frau Lehmann. Schreiben Sie etwas zu allen vier Punkten:"}</p>
          </article>

          <article className="writing-input-card">
            <div className="writing-input-card__header">
              <h2>Ihr Text</h2>
              <span>{wordCount} Wörter</span>
            </div>
            <textarea
              className="writing-textarea"
              value={draftText}
              onChange={(event) => {
                if (isChecked) {
                  setIsChecked(false);
                }
                setDraftText(event.target.value);
              }}
              placeholder="Schreiben Sie hier Ihre Antwort ..."
            />
          </article>
        </section>

        {isChecked ? (
          <section className="writing-review-grid">
            <article className="writing-review-card writing-review-card--user">
              <div className="writing-review-card__titleRow">
                <h2>Ihr Text</h2>
                <ExerciseFavoriteButton
                  isFavorited={isFavorited}
                  pending={favoritePending}
                  onClick={toggleFavorite}
                />
              </div>
              <p>{draftText || "Kein Text eingegeben."}</p>
            </article>

            {exampleTexts.map((example) => (
              <article key={example.id} className="writing-review-card writing-review-card--example">
                <div className="writing-review-card__header">
                  <h2>{example.label || "Beispieltext"}</h2>
                  {example.note ? <span>{example.note}</span> : null}
                </div>
                <p>{example.example_text}</p>
              </article>
            ))}
          </section>
        ) : null}

        <section className="writing-actions">
          <span className="writing-actions__meta">{wordCount} / {exercise?.words_limit || 80} Wörter</span>
          <div className="writing-actions__buttons">
            <ExamActionButton
              className="writing-check-btn"
              disabled={isChecked || !draftText.trim()}
              onClick={() => {
                setIsChecked(true);
              }}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="writing-reset-btn"
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
