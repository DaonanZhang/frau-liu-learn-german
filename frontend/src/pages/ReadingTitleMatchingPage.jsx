import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchReadingTitleMatchingExerciseDetail,
  fetchReadingTitleMatchingExercises,
} from "../api/exam_preparation/readingTitleMatching.js";
import "./ReadingTitleMatchingPage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie die Überschriften und die Texte. Finden Sie für jeden Text die passende Überschrift. Sie können jede Überschrift nur einmal benutzen.";

export default function ReadingTitleMatchingPage() {
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        const listData = await fetchReadingTitleMatchingExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;

        if (!firstExercise?.id) {
          throw new Error("No reading title matching exercise found.");
        }

        const detail = await fetchReadingTitleMatchingExerciseDetail(firstExercise.id);
        if (!aborted) {
          setExercise(detail || null);
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
  }, []);

  const options = useMemo(() => {
    return Array.isArray(exercise?.options) ? exercise.options : [];
  }, [exercise]);

  const items = useMemo(() => {
    return Array.isArray(exercise?.items) ? exercise.items : [];
  }, [exercise]);

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);

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
          <Link to="/modules/exam-preparation/lesen" className="reading-title-topbar__back">
            ← Zurück zu Lesen
          </Link>
          <span className="reading-title-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="reading-title-hero">
          <p className="reading-title-hero__eyebrow">READING_TITLE_MATCHING</p>
          <h1 className="reading-title-hero__title">
            {exercise?.exercise_base?.title || "Lesen Teil 1"}
          </h1>
        </section>

        <section className="reading-title-instruction">
          <p>{exercise?.instruction || FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="reading-title-texts">
          <div className="reading-title-text-grid">
            {items.map((item) => (
              <article key={item.id} className="reading-title-text-card">
                <div className="reading-title-text-card__badge">Text {item.item_number}</div>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="reading-title-questions">
          <div className="reading-title-question-list">
            {items.map((item) => (
              <article key={`question-${item.id}`} className="reading-title-question-card">
                <div className="reading-title-question-card__header">
                  <h3>Überschrift zu dem Text {item.item_number}</h3>
                  <span className="reading-title-question-card__selection">
                    {answers[item.id] ? `已选择 ${answers[item.id]}` : "未选择"}
                  </span>
                </div>

                <div className="reading-title-option-grid">
                  {options.map((option) => {
                    const checked = answers[item.id] === option.option_key;
                    const isCorrect = option.option_key === item.correct_option?.option_key;
                    const isWrongSelected = isChecked && checked && !isCorrect;
                    const shouldRevealCorrect = isChecked && isCorrect;
                    return (
                      <label
                        key={`${item.id}-${option.id}`}
                        className={[
                          "reading-title-option",
                          checked && !isChecked ? "reading-title-option--selected" : "",
                          shouldRevealCorrect ? "reading-title-option--correct" : "",
                          isWrongSelected ? "reading-title-option--wrong" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <input
                          type="radio"
                          name={`item-${item.id}`}
                          value={option.option_key}
                          checked={checked}
                          onChange={() => {
                            if (isChecked) {
                              setIsChecked(false);
                            }
                            setAnswers((previous) => ({
                              ...previous,
                              [item.id]: option.option_key,
                            }));
                          }}
                        />
                        <span className="reading-title-option__key">{option.option_key}</span>
                        <span className="reading-title-option__text">{option.option_text}</span>
                      </label>
                    );
                  })}
                </div>

                {isChecked ? (
                  <div
                    className={[
                      "reading-title-feedback",
                      answers[item.id] === item.correct_option?.option_key
                        ? "reading-title-feedback--correct"
                        : "reading-title-feedback--wrong",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <strong className="reading-title-feedback__title">
                      {answers[item.id] === item.correct_option?.option_key
                        ? "Richtig."
                        : "Nicht richtig."}
                    </strong>
                    <p className="reading-title-feedback__line">
                      Richtige Antwort: {item.correct_option?.option_key} - {item.correct_option?.option_text}
                    </p>
                    <p className="reading-title-feedback__line">
                      Erklärung: {item.explanation || "Keine zusätzliche Erklärung."}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="reading-title-actions">
            <button
              type="button"
              className="reading-title-check-btn"
              disabled={isChecked || !items.length || answeredCount !== items.length}
              onClick={() => {
                setIsChecked(true);
              }}
            >
              Prüfen
            </button>
            {isChecked ? (
              <button
                type="button"
                className="reading-title-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
                }}
              >
                Wiederholen
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
