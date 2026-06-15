import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchClozeMatchingExerciseDetail,
  fetchClozeMatchingExercises,
} from "../api/exam_preparation/clozeExercises.js";
import "./ClozeExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den folgenden Text. Welcher Ausdruck passt am besten in die Lücken?";

function renderParts(content) {
  return String(content || "").split(/(\{\{blank_\d+\}\})/g).filter(Boolean);
}

function extractBlankKey(token) {
  return token.replace(/[{}]/g, "");
}

export default function ClozeMatchingPage() {
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
        const listData = await fetchClozeMatchingExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;
        if (!firstExercise?.id) {
          throw new Error("No cloze matching exercise found.");
        }
        const detail = await fetchClozeMatchingExerciseDetail(firstExercise.id);
        if (!aborted) {
          setExercise(detail || null);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Failed to load cloze matching exercise.");
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

  const options = useMemo(() => Array.isArray(exercise?.options) ? exercise.options : [], [exercise]);
  const blankAnswers = useMemo(() => Array.isArray(exercise?.blank_answers) ? exercise.blank_answers : [], [exercise]);
  const blankMap = useMemo(
    () => Object.fromEntries(blankAnswers.map((blank) => [blank.blank_key, blank])),
    [blankAnswers]
  );
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const parts = useMemo(() => renderParts(exercise?.content_with_placeholders), [exercise]);

  if (loading) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-loading">Loading cloze matching exercise...</p></div></div>;
  }

  if (errorText) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-error">{errorText}</p></div></div>;
  }

  return (
    <div className="cloze-page">
      <div className="cloze-shell">
        <div className="cloze-topbar">
          <Link to="/modules/exam-preparation/sprachbausteine" className="cloze-topbar__back">
            ← Zurück zu Sprachbausteine
          </Link>
          <span className="cloze-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="cloze-hero">
          <p className="cloze-hero__eyebrow">CLOZE_MATCHING</p>
          <h1 className="cloze-hero__title">{exercise?.exercise_base?.title || "Sprachbausteine Teil 2"}</h1>
        </section>

        <section className="cloze-instruction">
          <p>{FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="cloze-pool-panel">
          <h2>Optionen</h2>
          <div className="cloze-pool">
            {options.map((option) => (
              <span
                key={option.id}
                className={[
                  "cloze-pool-chip",
                  option.is_extra ? "cloze-pool-chip--extra" : "",
                ].filter(Boolean).join(" ")}
              >
                {option.option_text}
              </span>
            ))}
          </div>
        </section>

        <section className="cloze-text-panel">
          <div className="cloze-text">
            {parts.map((part, index) => {
              if (!/^\{\{blank_\d+\}\}$/.test(part)) {
                return <span key={`${part}-${index}`}>{part}</span>;
              }
              const blankKey = extractBlankKey(part);
              const blank = blankMap[blankKey];
              const correctOption = blank?.correct_option;
              const selectedKey = answers[blankKey] || "";
              const isCorrect = !!correctOption && selectedKey === correctOption.option_key;

              return (
                <span key={blankKey} className="cloze-blank-inline">
                  <select
                    className={[
                      "cloze-select",
                      selectedKey && !isChecked ? "cloze-select--selected" : "",
                      isChecked && isCorrect ? "cloze-select--correct" : "",
                      isChecked && selectedKey && !isCorrect ? "cloze-select--wrong" : "",
                    ].filter(Boolean).join(" ")}
                    value={selectedKey}
                    onChange={(event) => {
                      if (isChecked) {
                        setIsChecked(false);
                      }
                      setAnswers((previous) => ({
                        ...previous,
                        [blankKey]: event.target.value,
                      }));
                    }}
                  >
                    <option value="">Lücke {blank?.blank_number || ""}</option>
                    {options.map((option) => (
                      <option key={option.id} value={option.option_key}>
                        {option.option_text}
                      </option>
                    ))}
                  </select>
                  {isChecked ? (
                    <span
                      className={[
                        "cloze-inline-feedback",
                        isCorrect ? "cloze-inline-feedback--correct" : "cloze-inline-feedback--wrong",
                      ].join(" ")}
                    >
                      {isCorrect ? "Richtig" : `Richtig: ${correctOption?.option_text || "-"}`}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </section>

        {isChecked ? (
          <section className="cloze-feedback-list">
            {blankAnswers.map((blank) => {
              const selectedOption = options.find((option) => option.option_key === answers[blank.blank_key]);
              const isCorrect = blank.correct_option?.option_key === answers[blank.blank_key];
              return (
                <article
                  key={blank.id}
                  className={[
                    "cloze-feedback-card",
                    isCorrect ? "cloze-feedback-card--correct" : "cloze-feedback-card--wrong",
                  ].join(" ")}
                >
                  <strong>Lücke {blank.blank_number}</strong>
                  <p>Ihre Antwort: {selectedOption?.option_text || "-"}</p>
                  <p>Richtige Antwort: {blank.correct_option?.option_text || "-"}</p>
                  <p>Erklärung: {blank.explanation || "Keine zusätzliche Erklärung."}</p>
                </article>
              );
            })}
          </section>
        ) : null}

        <section className="cloze-actions">
          <span className="cloze-actions__meta">{answeredCount} / {blankAnswers.length} beantwortet</span>
          <div className="cloze-actions__buttons">
            <button
              type="button"
              className="cloze-check-btn"
              disabled={isChecked || !blankAnswers.length || answeredCount !== blankAnswers.length}
              onClick={() => setIsChecked(true)}
            >
              Prüfen
            </button>
            {isChecked ? (
              <button
                type="button"
                className="cloze-reset-btn"
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
