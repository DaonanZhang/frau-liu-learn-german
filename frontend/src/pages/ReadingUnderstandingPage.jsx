import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchReadingUnderstandingExerciseDetail,
  fetchReadingUnderstandingExercises,
} from "../api/exam_preparation/readingUnderstanding.js";
import "./ReadingUnderstandingPage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den Text und die Aufgaben. Welche Lösung (a, b oder c) ist jeweils richtig?";

export default function ReadingUnderstandingPage() {
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

        const listData = await fetchReadingUnderstandingExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;

        if (!firstExercise?.id) {
          throw new Error("No reading understanding exercise found.");
        }

        const detail = await fetchReadingUnderstandingExerciseDetail(firstExercise.id);
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

  const questions = useMemo(() => {
    return Array.isArray(exercise?.questions) ? exercise.questions : [];
  }, [exercise]);

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);

  if (loading) {
    return (
      <div className="reading-understanding-page">
        <div className="reading-understanding-shell">
          <p className="reading-understanding-loading">Loading reading understanding exercise...</p>
        </div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="reading-understanding-page">
        <div className="reading-understanding-shell">
          <p className="reading-understanding-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reading-understanding-page">
      <div className="reading-understanding-shell">
        <div className="reading-understanding-topbar">
          <Link to="/modules/exam-preparation/lesen" className="reading-understanding-topbar__back">
            ← Zurück zu Lesen
          </Link>
          <span className="reading-understanding-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="reading-understanding-hero">
          <p className="reading-understanding-hero__eyebrow">READING_UNDERSTANDING</p>
          <h1 className="reading-understanding-hero__title">
            {exercise?.exercise_base?.title || "Lesen Teil 2"}
          </h1>
        </section>

        <section className="reading-understanding-instruction">
          <p>{FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="reading-understanding-text">
          <div className="reading-understanding-text__content">
            {String(exercise?.text_markdown || "")
              .split(/\n+/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </section>

        <section className="reading-understanding-questions">
          <div className="reading-understanding-question-list">
            {questions.map((question) => (
              <article key={question.id} className="reading-understanding-question-card">
                <div className="reading-understanding-question-card__header">
                  <h3>
                    {question.question_number}. {question.question_text}
                  </h3>
                  <span className="reading-understanding-question-card__selection">
                    {answers[question.id] ? `已选择 ${answers[question.id]}` : "未选择"}
                  </span>
                </div>

                <div className="reading-understanding-option-grid">
                  {(question.answer_options || []).map((option) => {
                    const checked = answers[question.id] === option.option_key;
                    const isCorrect = !!option.is_correct;
                    const isWrongSelected = isChecked && checked && !isCorrect;
                    const shouldRevealCorrect = isChecked && isCorrect;

                    return (
                      <label
                        key={option.id}
                        className={[
                          "reading-understanding-option",
                          checked && !isChecked ? "reading-understanding-option--selected" : "",
                          shouldRevealCorrect ? "reading-understanding-option--correct" : "",
                          isWrongSelected ? "reading-understanding-option--wrong" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option.option_key}
                          checked={checked}
                          onChange={() => {
                            if (isChecked) {
                              setIsChecked(false);
                            }
                            setAnswers((previous) => ({
                              ...previous,
                              [question.id]: option.option_key,
                            }));
                          }}
                        />
                        <span className="reading-understanding-option__key">{option.option_key}</span>
                        <span className="reading-understanding-option__text">{option.option_text}</span>
                      </label>
                    );
                  })}
                </div>

                {isChecked ? (
                  <div
                    className={[
                      "reading-understanding-feedback",
                      (question.answer_options || []).some(
                        (option) => option.option_key === answers[question.id] && option.is_correct
                      )
                        ? "reading-understanding-feedback--correct"
                        : "reading-understanding-feedback--wrong",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <strong className="reading-understanding-feedback__title">
                      {(question.answer_options || []).some(
                        (option) => option.option_key === answers[question.id] && option.is_correct
                      )
                        ? "Richtig."
                        : "Nicht richtig."}
                    </strong>
                    <p className="reading-understanding-feedback__line">
                      Richtige Antwort:{" "}
                      {(question.answer_options || []).find((option) => option.is_correct)?.option_key} -{" "}
                      {(question.answer_options || []).find((option) => option.is_correct)?.option_text}
                    </p>
                    <p className="reading-understanding-feedback__line">
                      Erklärung:{" "}
                      {(question.answer_options || []).find((option) => option.is_correct)?.explanation ||
                        "Keine zusätzliche Erklärung."}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="reading-understanding-actions">
            <button
              type="button"
              className="reading-understanding-check-btn"
              disabled={isChecked || !questions.length || answeredCount !== questions.length}
              onClick={() => {
                setIsChecked(true);
              }}
            >
              Prüfen
            </button>
            {isChecked ? (
              <button
                type="button"
                className="reading-understanding-reset-btn"
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
