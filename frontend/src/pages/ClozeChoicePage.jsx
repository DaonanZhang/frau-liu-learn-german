import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchClozeChoiceExerciseDetail,
} from "../api/exam_preparation/clozeExercises.js";
import {
  fetchClozeChoiceBlankStates,
  saveClozeChoiceBlankState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseOptionSheet from "../components/examPreparation/ExerciseOptionSheet.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import "./ClozeExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den Text und schließen Sie die Lücken. Welche Lösung ist jeweils richtig?";

function renderParts(content) {
  return String(content || "").split(/(\{\{blank_\d+\}\})/g).filter(Boolean);
}

function renderParagraphs(content) {
  return String(content || "")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => renderParts(paragraph));
}

function extractBlankKey(token) {
  return token.replace(/[{}]/g, "");
}

export default function ClozeChoicePage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
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
        if (!exerciseId) {
          throw new Error("No cloze choice exercise selected.");
        }
        const detail = await fetchClozeChoiceExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchClozeChoiceBlankStates(exerciseId);
          if (aborted) {
            return;
          }
          const nextAnswers = {};
          const nextFavorited = {};
          const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
          stateResults.forEach((stateItem) => {
            const blankId = stateItem?.blank;
            const selectedOptionKey = stateItem?.answer_payload?.selected_option_key;
            const blank = (detail?.blanks || []).find((item) => item.id === blankId);
            if (blank?.blank_key && selectedOptionKey) {
              nextAnswers[blank.blank_key] = selectedOptionKey;
            }
            if (blankId) {
              nextFavorited[blankId] = Boolean(stateItem?.is_favorited);
            }
          });
          setFavoritedByBlankId(nextFavorited);
          if (Object.keys(nextAnswers).length > 0) {
            setAnswers(nextAnswers);
            setIsChecked(true);
          }
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
  }, [exerciseId]);

  const blanks = useMemo(() => Array.isArray(exercise?.blanks) ? exercise.blanks : [], [exercise]);
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
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const paragraphs = useMemo(() => renderParagraphs(exercise?.content_with_placeholders), [exercise]);
  const activeBlank = activeBlankKey ? blankMap[activeBlankKey] : null;

  async function toggleFavorite(blank) {
    const nextValue = !favoritedByBlankId[blank.id];
    setFavoritePendingByBlankId((previous) => ({ ...previous, [blank.id]: true }));
    try {
      const selectedOptionKey = answers[blank.blank_key] || "";
      const selectedOption = (blank.options || []).find((option) => option.option_key === selectedOptionKey);
      await saveClozeChoiceBlankState({
        blank: blank.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_option_key: selectedOptionKey,
        },
        is_correct: selectedOption ? Boolean(selectedOption.is_correct) : null,
      });
      setFavoritedByBlankId((previous) => ({ ...previous, [blank.id]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByBlankId((previous) => ({ ...previous, [blank.id]: false }));
    }
  }

  if (loading) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-loading">练习加载中...</p></div></div>;
  }

  if (errorText) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-error">{errorText}</p></div></div>;
  }

  return (
    <div className="cloze-page">
      <div className="cloze-shell">
        <div className="cloze-topbar">
          <Link to="/modules/exam-preparation/sprachbausteine/cloze-choice" className="cloze-topbar__back">
            ← Zurück zu Sprachbausteine
          </Link>
          <span className="cloze-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="cloze-hero">
          <h1 className="cloze-hero__title">{heroTitle}</h1>
          {exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="cloze-hero__badges">
              {exercise?.exercise_base?.difficulty ? (
                <span className="cloze-hero__badge">
                  难度：{exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="cloze-hero__badge cloze-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="cloze-instruction">
          <span className="cloze-section-label">Beschreibung</span>
          <p>{FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="cloze-text-panel">
          <div className="cloze-text">
            {paragraphs.map((parts, paragraphIndex) => (
              <p key={`paragraph-${paragraphIndex}`} className="cloze-text__paragraph">
                {parts.map((part, index) => {
                  if (!/^\{\{blank_\d+\}\}$/.test(part)) {
                    return <span key={`${paragraphIndex}-${part}-${index}`}>{part}</span>;
                  }
                  const blankKey = extractBlankKey(part);
                  const blank = blankMap[blankKey];
                  const correctOption = (blank?.options || []).find((option) => option.is_correct);
                  const selectedKey = answers[blankKey] || "";
                  const isCorrect = !!correctOption && selectedKey === correctOption.option_key;

                  return (
                    <span key={blankKey} className="cloze-blank-inline">
                      <span
                        className={[
                          "cloze-select-frame",
                          selectedKey && !isChecked ? "cloze-select-frame--selected" : "",
                          isChecked && isCorrect ? "cloze-select-frame--correct" : "",
                          isChecked && selectedKey && !isCorrect ? "cloze-select-frame--wrong" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <button
                          type="button"
                          className={[
                            "cloze-select",
                            "cloze-select-trigger",
                            selectedKey && !isChecked ? "cloze-select--selected" : "",
                            isChecked && isCorrect ? "cloze-select--correct" : "",
                            isChecked && selectedKey && !isCorrect ? "cloze-select--wrong" : "",
                          ].filter(Boolean).join(" ")}
                          onClick={() => {
                            setActiveBlankKey(blankKey);
                          }}
                          aria-haspopup="dialog"
                          aria-expanded={activeBlankKey === blankKey}
                        >
                          {selectedKey
                            ? (blank?.options || []).find((option) => option.option_key === selectedKey)?.option_text || selectedKey
                            : `Lücke ${blank?.blank_number || ""}`}
                        </button>
                        <span className="cloze-select-frame__caret" aria-hidden="true">▾</span>
                      </span>
                      <ExerciseOptionSheet
                        open={activeBlankKey === blankKey}
                        title={`Lücke ${blank?.blank_number || ""}`}
                        subtitle="请选择当前空格的答案。"
                        selectedValue={selectedKey}
                        options={blank?.options?.map((option) => ({
                          value: option.option_key,
                          label: option.option_text,
                        })) || []}
                        onClose={() => {
                          setActiveBlankKey("");
                        }}
                        onSelect={(nextValue) => {
                          if (isChecked) {
                            setIsChecked(false);
                          }
                          setAnswers((previous) => ({
                            ...previous,
                            [blankKey]: nextValue,
                          }));
                        }}
                      />
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
              </p>
            ))}
          </div>
        </section>

        {isChecked ? (
          <section className="cloze-feedback-list">
            <div className="cloze-section-heading">
              <span className="cloze-section-label">结果与讲解</span>
            </div>
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
                  <div className="cloze-feedback-card__header">
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
                  <p>Richtige Antwort: {correctOption?.option_text || "-"}</p>
                  <p>Erklärung: {correctOption?.explanation || "Keine zusätzliche Erklärung."}</p>
                </article>
              );
            })}
          </section>
        ) : null}

        <section className="cloze-actions">
          <div className="cloze-actions__buttons">
            <ExamActionButton
              className="cloze-check-btn"
              disabled={isChecked || !blanks.length || answeredCount !== blanks.length}
              onClick={() => setIsChecked(true)}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="cloze-reset-btn"
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
