import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchReadingTitleMatchingExerciseDetail,
} from "../api/exam_preparation/readingTitleMatching.js";
import {
  fetchReadingTitleMatchingItemStates,
  saveReadingTitleMatchingItemState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseOptionSheet from "../components/examPreparation/ExerciseOptionSheet.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import "./ReadingTitleMatchingPage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie die Überschriften und die Texte. Finden Sie für jeden Text die passende Überschrift. Sie können jede Überschrift nur einmal benutzen.";

export default function ReadingTitleMatchingPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByItemId, setFavoritedByItemId] = useState({});
  const [favoritePendingByItemId, setFavoritePendingByItemId] = useState({});
  const [activeItemId, setActiveItemId] = useState("");

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        if (!exerciseId) {
          throw new Error("No reading title matching exercise selected.");
        }

        const detail = await fetchReadingTitleMatchingExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchReadingTitleMatchingItemStates(exerciseId);
          if (aborted) {
            return;
          }
          const nextAnswers = {};
          const nextFavorited = {};
          const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
          stateResults.forEach((stateItem) => {
            const itemId = stateItem?.item;
            const selectedOptionKey = stateItem?.answer_payload?.selected_option_key;
            if (itemId && selectedOptionKey) {
              nextAnswers[itemId] = selectedOptionKey;
            }
            if (itemId) {
              nextFavorited[itemId] = Boolean(stateItem?.is_favorited);
            }
          });
          setFavoritedByItemId(nextFavorited);
          if (Object.keys(nextAnswers).length > 0) {
            setAnswers(nextAnswers);
            setIsChecked(true);
          }
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

  const options = useMemo(() => {
    return Array.isArray(exercise?.options) ? exercise.options : [];
  }, [exercise]);

  const items = useMemo(() => {
    return Array.isArray(exercise?.items) ? exercise.items : [];
  }, [exercise]);
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);
  const activeItem = activeItemId ? items.find((item) => String(item.id) === String(activeItemId)) : null;

  async function toggleFavorite(item) {
    const nextValue = !favoritedByItemId[item.id];
    setFavoritePendingByItemId((previous) => ({ ...previous, [item.id]: true }));
    try {
      await saveReadingTitleMatchingItemState({
        item: item.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_option_key: answers[item.id] || "",
        },
        is_correct: answers[item.id] === item.correct_option?.option_key,
      });
      setFavoritedByItemId((previous) => ({ ...previous, [item.id]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByItemId((previous) => ({ ...previous, [item.id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="reading-title-page">
        <div className="reading-title-shell">
          <p className="reading-title-loading">Loading reading title matching exercise...</p>
        </div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="reading-title-page">
        <div className="reading-title-shell">
          <p className="reading-title-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reading-title-page">
      <div className="reading-title-shell">
        <div className="reading-title-topbar">
          <Link to="/modules/exam-preparation/lesen/title-matching" className="reading-title-topbar__back">
            ← Zurück zu Lesen
          </Link>
          <span className="reading-title-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="reading-title-hero">
          <div className="reading-title-hero__main">
            <h1 className="reading-title-hero__title">{heroTitle}</h1>
          </div>
          {exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="reading-title-hero__badges">
              {exercise?.exercise_base?.difficulty ? (
                <span className="reading-title-hero__badge">
                  难度：{exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="reading-title-hero__badge reading-title-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="reading-title-instruction">
          <div className="reading-title-instruction__header">
            <span className="reading-title-instruction__label">Anleitung</span>
          </div>
          <p>{exercise?.instruction || FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="reading-title-texts">
          <div className="reading-title-text-grid">
            {items.map((item) => {
              const selectedKey = answers[item.id] || "";
              const isCorrect = selectedKey === item.correct_option?.option_key;
              return (
                <article key={item.id} className="reading-title-text-card">
                  <div className="reading-title-text-card__topline">
                    <div className="reading-title-text-card__badge">Text {item.item_number}</div>
                    <div className="reading-title-inline-answer reading-title-inline-answer--inline">
                      <button
                        type="button"
                        className={[
                          "reading-title-select",
                          "reading-title-select-trigger",
                          selectedKey && !isChecked ? "reading-title-select--selected" : "",
                          isChecked && isCorrect ? "reading-title-select--correct" : "",
                          isChecked && selectedKey && !isCorrect ? "reading-title-select--wrong" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => {
                          setActiveItemId(String(item.id));
                        }}
                        aria-label={`Überschrift zu Text ${item.item_number}`}
                        aria-haspopup="dialog"
                        aria-expanded={String(activeItemId) === String(item.id)}
                      >
                        {selectedKey
                          ? options.find((option) => option.option_key === selectedKey)?.option_text || selectedKey
                          : "Überschrift auswählen"}
                      </button>
                      <ExerciseOptionSheet
                        open={String(activeItemId) === String(item.id)}
                        title={`Text ${item.item_number}`}
                        subtitle="请选择最匹配的标题。"
                        selectedValue={selectedKey}
                        options={options.map((option) => ({
                          value: option.option_key,
                          label: option.option_text,
                          meta: option.option_key,
                        }))}
                        onClose={() => {
                          setActiveItemId("");
                        }}
                        onSelect={(nextValue) => {
                          if (isChecked) {
                            setIsChecked(false);
                          }
                          setAnswers((previous) => ({
                            ...previous,
                            [item.id]: nextValue,
                          }));
                        }}
                      />
                    </div>
                  </div>
                  <p>{item.text}</p>

                  {isChecked ? (
                    <div
                      className={[
                        "reading-title-feedback",
                        isCorrect ? "reading-title-feedback--correct" : "reading-title-feedback--wrong",
                      ].filter(Boolean).join(" ")}
                    >
                      <div className="reading-title-feedback__header">
                        <strong className="reading-title-feedback__title">
                          {isCorrect ? "Richtig" : "Falsch"}
                        </strong>
                        <ExerciseFavoriteButton
                          isFavorited={Boolean(favoritedByItemId[item.id])}
                          pending={Boolean(favoritePendingByItemId[item.id])}
                          onClick={() => {
                            toggleFavorite(item);
                          }}
                        />
                      </div>
                      <p className="reading-title-feedback__line">
                        Richtige Antwort: {item.correct_option?.option_key} - {item.correct_option?.option_text}
                      </p>
                      <p className="reading-title-feedback__line">
                        Erklärung: {item.explanation || "Keine zusätzliche Erklärung."}
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="reading-title-actions">
            <span className="reading-title-actions__hint">
              {answeredCount === items.length ? "Alle Texte sind zugeordnet." : "Ordne zuerst jeden Text einem Titel zu."}
            </span>
            <ExamActionButton
              className="reading-title-check-btn"
              disabled={isChecked || !items.length || answeredCount !== items.length}
              onClick={() => {
                setIsChecked(true);
              }}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="reading-title-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
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
