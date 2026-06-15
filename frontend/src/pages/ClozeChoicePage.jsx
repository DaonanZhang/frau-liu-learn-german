import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchClozeChoiceExerciseDetail,
  fetchClozeChoiceExercises,
} from "../api/exam_preparation/clozeExercises.js";
import "./ClozeExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den Text und schließen Sie die Lücken. Welche Lösung ist jeweils richtig?";

function renderParts(content) {
  return String(content || "").split(/(\{\{blank_\d+\}\})/g).filter(Boolean);
}

function extractBlankKey(token) {
  return token.replace(/[{}]/g, "");
}

export default function ClozeChoicePage() {
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
        const listData = await fetchClozeChoiceExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;
        if (!firstExercise?.id) {
          throw new Error("No cloze choice exercise found.");
        }
        const detail = await fetchClozeChoiceExerciseDetail(firstExercise.id);
        if (!aborted) {
          setExercise(detail || null);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Failed to load cloze choice exercise.");
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

  const blanks = useMemo(() => Array.isArray(exercise?.blanks) ? exercise.blanks : [], [exercise]);
  const blankMap = useMemo(
    () => Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank])),
    [blanks]
  );
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const parts = useMemo(() => renderParts(exercise?.content_with_placeholders), [exercise]);

  if (loading) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-loading">Loading cloze choice exercise...</p></div></div>;
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
          <p className="cloze-hero__eyebrow">CLOZE_CHOICE</p>
          <h1 className="cloze-hero__title">{exercise?.exercise_base?.title || "Sprachbausteine Teil 1"}</h1>
        </section>

        <section className="cloze-instruction">
          <p>{FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="cloze-text-panel">
          <div className="cloze-text">
            {parts.map((part, index) => {
              if (!/^\{\{blank_\d+\}\}$/.test(part)) {
                return <span key={`${part}-${index}`}>{part}</span>;
              }
              const blankKey = extractBlankKey(part);
              const blank = blankMap[blankKey];
              const correctOption = (blank?.options || []).find((option) => option.is_correct);
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
                    {(blank?.options || []).map((option) => (
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
            {blanks.map((blank) => {
              const correctOption = (blank.options || []).find((option) => option.is_correct);
              const selectedOption = (blank.options || []).find((option) => option.option_key === answers[blank.blank_key]);
              const isCorrect = !!selectedOption?.is_correct;
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
                  <p>Richtige Antwort: {correctOption?.option_text || "-"}</p>
                  <p>Erklärung: {correctOption?.explanation || "Keine zusätzliche Erklärung."}</p>
                </article>
              );
            })}
          </section>
        ) : null}

        <section className="cloze-actions">
          <span className="cloze-actions__meta">{answeredCount} / {blanks.length} beantwortet</span>
          <div className="cloze-actions__buttons">
            <button
              type="button"
              className="cloze-check-btn"
              disabled={isChecked || !blanks.length || answeredCount !== blanks.length}
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
