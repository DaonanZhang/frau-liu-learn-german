import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchReadingAdMatchingExerciseDetail,
} from "../api/exam_preparation/readingAdMatching.js";
import {
  fetchReadingAdMatchingItemStates,
  saveReadingAdMatchingItemState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ReadingAdMatchingWorkspace from "../components/examPreparation/ReadingAdMatchingWorkspace.jsx";
import "./ReadingAdMatchingPage.css";

const FALLBACK_INSTRUCTION =
  "Lesen sie die Situationen 1-10 und die Anzeigen a-l. Finden sie für jede die passende Anzeige. Sie können jede Anzeige nur einmal benutzen. Markieren sie Ihre Lösungen für die Aufgaben 1–10 auf dem Antwortbogen. Wenn Sie zu einer Situation keine Anzeige finden, markieren Sie x.";

export default function ReadingAdMatchingPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByItemId, setFavoritedByItemId] = useState({});
  const [favoritePendingByItemId, setFavoritePendingByItemId] = useState({});
  const [workspaceResetKey, setWorkspaceResetKey] = useState(0);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        if (!exerciseId) {
          throw new Error("No reading ad matching exercise selected.");
        }

        const detail = await fetchReadingAdMatchingExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchReadingAdMatchingItemStates(exerciseId);
          if (aborted) {
            return;
          }
          const nextAnswers = {};
          const nextFavorited = {};
          const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
          stateResults.forEach((stateItem) => {
            const itemId = stateItem?.item;
            const selectedAdKey = stateItem?.answer_payload?.selected_ad_key;
            if (itemId && selectedAdKey) {
              nextAnswers[itemId] = selectedAdKey;
            }
            if (itemId) {
              nextFavorited[itemId] = Boolean(stateItem?.is_favorited);
            }
          });
          setFavoritedByItemId(nextFavorited);
          const itemCount = Array.isArray(detail?.items) ? detail.items.length : 0;
          setAnswers(nextAnswers);
          setIsChecked(itemCount > 0 && Object.keys(nextAnswers).length === itemCount);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Failed to load exercise.");
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

  const items = useMemo(() => {
    return Array.isArray(exercise?.items) ? exercise.items : [];
  }, [exercise]);
  const heroTitle = useMemo(() => {
    return `Übung ${exercise?.exercise_base?.external_id || exercise?.id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);

  async function toggleFavorite(item) {
    const nextValue = !favoritedByItemId[item.id];
    setFavoritePendingByItemId((previous) => ({ ...previous, [item.id]: true }));
    try {
      await saveReadingAdMatchingItemState({
        item: item.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_ad_key: answers[item.id] || "",
        },
        is_correct: answers[item.id] === item.correct_ad?.ad_key,
      });
      setFavoritedByItemId((previous) => ({ ...previous, [item.id]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByItemId((previous) => ({ ...previous, [item.id]: false }));
    }
  }

  async function handleCheck() {
    setIsChecked(true);

    try {
      await Promise.all(
        items.map((item) =>
          saveReadingAdMatchingItemState({
            item: item.id,
            is_favorited: Boolean(favoritedByItemId[item.id]),
            answer_payload: {
              selected_ad_key: answers[item.id] || "",
            },
            is_correct: answers[item.id] === item.correct_ad?.ad_key,
          })
        )
      );
    } catch (error) {
      setErrorText(error?.message || "Antworten konnten nicht gespeichert werden.");
    }
  }

  if (loading) {
    return (
      <div className="reading-ad-page">
        <div className="reading-ad-shell">
          <p className="reading-ad-loading">Loading reading ad matching exercise...</p>
        </div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="reading-ad-page">
        <div className="reading-ad-shell">
          <p className="reading-ad-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reading-ad-page">
      <div className="reading-ad-shell">
        <div className="reading-ad-topbar">
          <Link to="/modules/exam-preparation/lesen/ad-matching" className="reading-ad-topbar__back">
            ← Zurück zu Lesen
          </Link>
          <span className="reading-ad-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="reading-ad-hero">
          <div className="reading-ad-hero__main">
            <h1 className="reading-ad-hero__title">{heroTitle}</h1>
          </div>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="reading-ad-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="reading-ad-hero__badge reading-ad-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty ? (
                <span className="reading-ad-hero__badge">
                  难度：{exercise.exercise_base.level || exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="reading-ad-hero__badge reading-ad-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="reading-ad-instruction">
          <div className="reading-ad-instruction__header">
            <span className="reading-ad-instruction__label">Anleitung</span>
          </div>
          <p>{exercise?.instruction || FALLBACK_INSTRUCTION}</p>
        </section>

        <ReadingAdMatchingWorkspace
          key={`${exercise?.id || "exercise"}-${workspaceResetKey}`}
          exercise={exercise}
          answers={answers}
          review={isChecked}
          onAnswer={(itemId, adKey) => {
            setAnswers((previous) => ({ ...previous, [itemId]: adKey }));
          }}
          favoriteFor={(item) => ({
            isFavorited: Boolean(favoritedByItemId[item.id]),
            pending: Boolean(favoritePendingByItemId[item.id]),
            onClick: () => toggleFavorite(item),
          })}
        />

        <div className="reading-ad-actions">
          <ExamActionButton
            className="reading-ad-check-btn"
            disabled={isChecked || !items.length || answeredCount !== items.length}
            onClick={handleCheck}
            label="Prüfen"
            icon="check"
          />
          {isChecked ? (
            <ExamActionButton
              className="reading-ad-reset-btn"
              onClick={() => {
                setAnswers({});
                setIsChecked(false);
                setWorkspaceResetKey((value) => value + 1);
              }}
              label="Wiederholen"
              icon="rotate"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
