import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchSpeakingGapBlankStates,
  fetchSpeakingGapMatchingExerciseDetail,
  fetchSpeakingGapMatchingExercises,
  saveSpeakingGapBlankState,
} from "../api/exam_preparation/speakingExercises.js";
import "./SpeakingExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den Text und wählen Sie für jede Lücke die passende Aussage aus.";

function renderParts(content) {
  return String(content || "").split(/(\{\{blank_\d+\}\})/g).filter(Boolean);
}

function extractBlankKey(token) {
  return token.replace(/[{}]/g, "");
}

export default function SpeakingGapMatchingPage() {
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [saveStateText, setSaveStateText] = useState("");
  const [saveErrorText, setSaveErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        setSaveStateText("");
        setSaveErrorText("");

        const listData = await fetchSpeakingGapMatchingExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;
        if (!firstExercise?.id) {
          throw new Error("No speaking gap matching exercise found.");
        }

        const detail = await fetchSpeakingGapMatchingExerciseDetail(firstExercise.id);
        if (aborted) {
          return;
        }

        setExercise(detail || null);

        const stateData = await fetchSpeakingGapBlankStates(firstExercise.id);
        if (aborted) {
          return;
        }

        const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
        const nextAnswers = {};
        const blanksById = Object.fromEntries(
          (Array.isArray(detail?.blanks) ? detail.blanks : []).map((blank) => [blank.id, blank])
        );
        stateResults.forEach((item) => {
          const selectedOptionKey = item?.answer_payload?.selected_option_key;
          const blankKey = blanksById[item?.blank]?.blank_key;
          if (blankKey && selectedOptionKey) {
            nextAnswers[blankKey] = selectedOptionKey;
          }
        });
        if (Object.keys(nextAnswers).length > 0) {
          setAnswers(nextAnswers);
          setIsChecked(true);
          setSaveStateText("已恢复上次 Prüfen 后的作答状态。");
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Failed to load speaking gap matching exercise.");
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

  const options = useMemo(() => (Array.isArray(exercise?.options) ? exercise.options : []), [exercise]);
  const blanks = useMemo(() => (Array.isArray(exercise?.blanks) ? exercise.blanks : []), [exercise]);
  const blankMap = useMemo(
    () => Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank])),
    [blanks]
  );
  const parts = useMemo(() => renderParts(exercise?.content_with_placeholders), [exercise]);
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  async function handleCheck() {
    setIsChecked(true);
    setSaveStateText("保存状态中...");
    setSaveErrorText("");

    try {
      await Promise.all(
        blanks.map((blank) => {
          const selectedOptionKey = answers[blank.blank_key] || "";
          return saveSpeakingGapBlankState({
            blank: blank.id,
            answer_payload: {
              selected_option_key: selectedOptionKey,
            },
            is_correct: selectedOptionKey === blank.correct_option?.option_key,
          });
        })
      );
      setSaveStateText("已保存当前 Prüfen 结果。");
    } catch (error) {
      setSaveStateText("");
      setSaveErrorText(error?.message || "保存状态失败。");
    }
  }

  if (loading) {
    return (
      <div className="speaking-page">
        <div className="speaking-shell">
          <p className="speaking-loading">Loading speaking gap matching exercise...</p>
        </div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="speaking-page">
        <div className="speaking-shell">
          <p className="speaking-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="speaking-page">
      <div className="speaking-shell">
        <div className="speaking-topbar">
          <Link to="/modules/exam-preparation/sprechen" className="speaking-topbar__back">
            ← Zurück zu Sprechen
          </Link>
          <span className="speaking-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="speaking-hero">
          <p className="speaking-hero__eyebrow">SPEAKING_GAP_MATCHING</p>
          <h1 className="speaking-hero__title">
            {exercise?.exercise_base?.title || "Sprechen Teil 1"}
          </h1>
        </section>

        <section className="speaking-instruction">
          <p>{FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="speaking-panel">
          <div className="speaking-options-pool">
            {options.map((option) => (
              <article key={option.id} className="speaking-option-chip">
                <strong>{option.option_key}</strong>
                <p>{option.option_text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="speaking-panel">
          <div className="speaking-content">
            {parts.map((part, index) => {
              if (!/^\{\{blank_\d+\}\}$/.test(part)) {
                return <span key={`${part}-${index}`}>{part}</span>;
              }

              const blankKey = extractBlankKey(part);
              const blank = blankMap[blankKey];
              const selectedKey = answers[blankKey] || "";
              const isCorrect = selectedKey === blank?.correct_option?.option_key;

              return (
                <span key={blankKey} className="speaking-blank-inline">
                  <select
                    className={[
                      "speaking-select",
                      selectedKey && !isChecked ? "speaking-select--selected" : "",
                      isChecked && isCorrect ? "speaking-select--correct" : "",
                      isChecked && selectedKey && !isCorrect ? "speaking-select--wrong" : "",
                    ].filter(Boolean).join(" ")}
                    value={selectedKey}
                    onChange={(event) => {
                      if (isChecked) {
                        setIsChecked(false);
                      }
                      setSaveStateText("");
                      setSaveErrorText("");
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
                        "speaking-inline-feedback",
                        isCorrect ? "speaking-inline-feedback--correct" : "speaking-inline-feedback--wrong",
                      ].join(" ")}
                    >
                      {isCorrect
                        ? "Richtig"
                        : `Richtig: ${blank?.correct_option?.option_text || "-"}`}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
          {saveStateText ? <div className="speaking-state">{saveStateText}</div> : null}
          {saveErrorText ? <div className="speaking-state speaking-state--error">{saveErrorText}</div> : null}
        </section>

        {isChecked ? (
          <section className="speaking-feedback-list">
            {blanks.map((blank) => {
              const selectedOption = options.find((option) => option.option_key === answers[blank.blank_key]);
              const isCorrect = answers[blank.blank_key] === blank.correct_option?.option_key;
              return (
                <article
                  key={blank.id}
                  className={[
                    "speaking-feedback-card",
                    isCorrect ? "speaking-feedback-card--correct" : "speaking-feedback-card--wrong",
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

        <section className="speaking-actions">
          <span className="speaking-actions__meta">{answeredCount} / {blanks.length} beantwortet</span>
          <div className="speaking-actions__buttons">
            <button
              type="button"
              className="speaking-check-btn"
              disabled={isChecked || !blanks.length || answeredCount !== blanks.length}
              onClick={handleCheck}
            >
              Prüfen
            </button>
            {isChecked ? (
              <button
                type="button"
                className="speaking-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setSaveStateText("");
                  setSaveErrorText("");
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
