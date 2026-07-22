import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchSpeakingGapBlankStates,
  fetchSpeakingGapMatchingExerciseDetail,
  saveSpeakingGapBlankState,
} from "../api/exam_preparation/speakingExercises.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseOptionSheet from "../components/examPreparation/ExerciseOptionSheet.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
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
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [saveStateText, setSaveStateText] = useState("");
  const [saveErrorText, setSaveErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByBlankId, setFavoritedByBlankId] = useState({});
  const [favoritePendingByBlankId, setFavoritePendingByBlankId] = useState({});
  const [activeBlankKey, setActiveBlankKey] = useState("");

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        setSaveStateText("");
        setSaveErrorText("");

        if (!exerciseId) {
          throw new Error("No speaking gap matching exercise selected.");
        }

        const detail = await fetchSpeakingGapMatchingExerciseDetail(exerciseId);
        if (aborted) {
          return;
        }

        setExercise(detail || null);

        const stateData = await fetchSpeakingGapBlankStates(exerciseId);
        if (aborted) {
          return;
        }

        const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
        const nextAnswers = {};
        const nextFavorited = {};
        const blanksById = Object.fromEntries(
          (Array.isArray(detail?.blanks) ? detail.blanks : []).map((blank) => [blank.id, blank])
        );
        stateResults.forEach((item) => {
          const selectedOptionKey = item?.answer_payload?.selected_option_key;
          const blankKey = blanksById[item?.blank]?.blank_key;
          if (blankKey && selectedOptionKey) {
            nextAnswers[blankKey] = selectedOptionKey;
          }
          if (item?.blank) {
            nextFavorited[item.blank] = Boolean(item?.is_favorited);
          }
        });
        setFavoritedByBlankId(nextFavorited);
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
  }, [exerciseId]);

  const options = useMemo(() => (Array.isArray(exercise?.options) ? exercise.options : []), [exercise]);
  const blanks = useMemo(() => (Array.isArray(exercise?.blanks) ? exercise.blanks : []), [exercise]);
  const blankMap = useMemo(
    () => Object.fromEntries(blanks.map((blank) => [blank.blank_key, blank])),
    [blanks]
  );
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);
  const parts = useMemo(() => renderParts(exercise?.content_with_placeholders), [exercise]);
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const activeBlank = activeBlankKey ? blankMap[activeBlankKey] : null;

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

  async function toggleFavorite(blank) {
    const nextValue = !favoritedByBlankId[blank.id];
    setFavoritePendingByBlankId((previous) => ({ ...previous, [blank.id]: true }));
    try {
      const selectedOptionKey = answers[blank.blank_key] || "";
      await saveSpeakingGapBlankState({
        blank: blank.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_option_key: selectedOptionKey,
        },
        is_correct: selectedOptionKey === blank.correct_option?.option_key,
      });
      setFavoritedByBlankId((previous) => ({ ...previous, [blank.id]: nextValue }));
    } catch (error) {
      setSaveStateText("");
      setSaveErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByBlankId((previous) => ({ ...previous, [blank.id]: false }));
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
          <Link to="/modules/exam-preparation/sprechen/gap-matching" className="speaking-topbar__back">
            ← Zurück zu Sprechen
          </Link>
          <span className="speaking-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="speaking-hero">
          <h1 className="speaking-hero__title">{heroTitle}</h1>
          {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="speaking-hero__badges">
              {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty ? (
                <span className="speaking-hero__badge">
                  难度：{exercise.exercise_base.level || exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="speaking-hero__badge speaking-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
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
                  <button
                    type="button"
                    className={[
                      "speaking-select",
                      "speaking-select-trigger",
                      selectedKey && !isChecked ? "speaking-select--selected" : "",
                      isChecked && isCorrect ? "speaking-select--correct" : "",
                      isChecked && selectedKey && !isCorrect ? "speaking-select--wrong" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => {
                      setActiveBlankKey(blankKey);
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={activeBlankKey === blankKey}
                  >
                    {selectedKey
                      ? options.find((option) => option.option_key === selectedKey)?.option_text || selectedKey
                      : `Lücke ${blank?.blank_number || ""}`}
                  </button>
                  <ExerciseOptionSheet
                    open={activeBlankKey === blankKey}
                    title={`Lücke ${blank?.blank_number || ""}`}
                    subtitle="请选择当前空格的答案。"
                    selectedValue={selectedKey}
                    options={options.map((option) => ({
                      value: option.option_key,
                      label: option.option_text,
                    }))}
                    onClose={() => {
                      setActiveBlankKey("");
                    }}
                    onSelect={(nextValue) => {
                      if (isChecked) {
                        setIsChecked(false);
                      }
                      setSaveStateText("");
                      setSaveErrorText("");
                      setAnswers((previous) => ({
                        ...previous,
                        [blankKey]: nextValue,
                      }));
                    }}
                  />
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
                  <div className="speaking-feedback-card__header">
                    <strong>Lücke {blank.blank_number}</strong>
                    <ExerciseFavoriteButton
                      isFavorited={Boolean(favoritedByBlankId[blank.id])}
                      pending={Boolean(favoritePendingByBlankId[blank.id])}
                      onClick={() => {
                        toggleFavorite(blank);
                      }}
                    />
                  </div>
                  <p>Ihre Antwort: {selectedOption?.option_text || "-"}</p>
                  <p>Richtige Antwort: {blank.correct_option?.option_text || "-"}</p>
                  <p>Erklärung: {blank.explanation || "Keine zusätzliche Erklärung."}</p>
                </article>
              );
            })}
          </section>
        ) : null}

        <section className="speaking-actions">
          <div className="speaking-actions__buttons">
            <ExamActionButton
              className="speaking-check-btn"
              disabled={isChecked || !blanks.length || answeredCount !== blanks.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="speaking-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setSaveStateText("");
                  setSaveErrorText("");
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
