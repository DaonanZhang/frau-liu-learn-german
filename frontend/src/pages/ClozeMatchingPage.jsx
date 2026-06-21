import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchClozeMatchingExerciseDetail,
  fetchClozeMatchingExercises,
} from "../api/exam_preparation/clozeExercises.js";
import {
  fetchClozeMatchingBlankStates,
  saveClozeMatchingBlankState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
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
  const [favoritedByBlankId, setFavoritedByBlankId] = useState({});
  const [favoritePendingByBlankId, setFavoritePendingByBlankId] = useState({});
  const [saveStateText, setSaveStateText] = useState("");
  const [draggedOptionKey, setDraggedOptionKey] = useState("");
  const [dragSourceBlankKey, setDragSourceBlankKey] = useState("");
  const [activeDropBlankKey, setActiveDropBlankKey] = useState("");
  const [isPoolDropActive, setIsPoolDropActive] = useState(false);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        setSaveStateText("");
        const listData = await fetchClozeMatchingExercises();
        const firstExercise = Array.isArray(listData?.results) ? listData.results[0] : null;
        if (!firstExercise?.id) {
          throw new Error("No cloze matching exercise found.");
        }
        const detail = await fetchClozeMatchingExerciseDetail(firstExercise.id);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchClozeMatchingBlankStates(firstExercise.id);
          if (aborted) {
            return;
          }
          const nextAnswers = {};
          const nextFavorited = {};
          const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
          stateResults.forEach((stateItem) => {
            const blankId = stateItem?.blank;
            const selectedOptionKey = stateItem?.answer_payload?.selected_option_key;
            const blank = (detail?.blank_answers || []).find((item) => item.id === blankId);
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
            setSaveStateText("已恢复上次 Prüfen 后的作答状态。");
          }
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
  const optionMap = useMemo(
    () => Object.fromEntries(options.map((option) => [option.option_key, option])),
    [options]
  );
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const parts = useMemo(() => renderParts(exercise?.content_with_placeholders), [exercise]);
  const assignedOptionKeys = useMemo(
    () => new Set(Object.values(answers).filter(Boolean)),
    [answers]
  );
  const poolOptions = useMemo(
    () => options.filter((option) => !assignedOptionKeys.has(option.option_key)),
    [options, assignedOptionKeys]
  );

  function assignOptionToBlank(blankKey, optionKey, sourceBlankKey = "") {
    if (!blankKey || !optionKey) {
      return;
    }
    setAnswers((previous) => {
      const nextAnswers = { ...previous };
      const occupantBlankKey = Object.entries(nextAnswers).find(
        ([candidateBlankKey, candidateOptionKey]) =>
          candidateBlankKey !== blankKey && candidateOptionKey === optionKey
      )?.[0];

      if (occupantBlankKey) {
        nextAnswers[occupantBlankKey] = "";
      }

      if (sourceBlankKey && sourceBlankKey !== blankKey) {
        nextAnswers[sourceBlankKey] = "";
      }

      nextAnswers[blankKey] = optionKey;
      return nextAnswers;
    });
  }

  function clearBlankAssignment(blankKey) {
    if (!blankKey) {
      return;
    }
    setAnswers((previous) => ({
      ...previous,
      [blankKey]: "",
    }));
  }

  function handleDragStart(optionKey, sourceBlankKey = "") {
    setDraggedOptionKey(optionKey);
    setDragSourceBlankKey(sourceBlankKey);
    if (isChecked) {
      setIsChecked(false);
    }
    setSaveStateText("");
  }

  function handleDragEnd() {
    setDraggedOptionKey("");
    setDragSourceBlankKey("");
    setActiveDropBlankKey("");
    setIsPoolDropActive(false);
  }

  async function toggleFavorite(blank) {
    const nextValue = !favoritedByBlankId[blank.id];
    setFavoritePendingByBlankId((previous) => ({ ...previous, [blank.id]: true }));
    try {
      await saveClozeMatchingBlankState({
        blank: blank.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_option_key: answers[blank.blank_key] || "",
        },
        is_correct: blank.correct_option?.option_key === answers[blank.blank_key],
      });
      setFavoritedByBlankId((previous) => ({ ...previous, [blank.id]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByBlankId((previous) => ({ ...previous, [blank.id]: false }));
    }
  }

  async function handleCheck() {
    setIsChecked(true);
    setSaveStateText("保存状态中...");

    try {
      await Promise.all(
        blankAnswers.map((blank) =>
          saveClozeMatchingBlankState({
            blank: blank.id,
            is_favorited: Boolean(favoritedByBlankId[blank.id]),
            answer_payload: {
              selected_option_key: answers[blank.blank_key] || "",
            },
            is_correct: blank.correct_option?.option_key === answers[blank.blank_key],
          })
        )
      );
      setSaveStateText("已保存当前 Prüfen 结果。");
    } catch (error) {
      setErrorText(error?.message || "状态保存失败。");
      setSaveStateText("");
    }
  }

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
          <div
            className={[
              "cloze-pool",
              isPoolDropActive ? "cloze-pool--drop-active" : "",
            ].filter(Boolean).join(" ")}
            onDragOver={(event) => {
              if (!draggedOptionKey) {
                return;
              }
              event.preventDefault();
              setIsPoolDropActive(true);
            }}
            onDragLeave={() => {
              setIsPoolDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragSourceBlankKey) {
                clearBlankAssignment(dragSourceBlankKey);
              }
              setSaveStateText("");
              handleDragEnd();
            }}
          >
            {poolOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                draggable={!isChecked}
                className={[
                  "cloze-pool-chip",
                  option.is_extra ? "cloze-pool-chip--extra" : "",
                ].filter(Boolean).join(" ")}
                onDragStart={() => {
                  handleDragStart(option.option_key, "");
                }}
                onDragEnd={handleDragEnd}
              >
                {option.option_text}
              </button>
            ))}
            {!poolOptions.length ? (
              <span className="cloze-pool__empty">Alle Optionen sind gerade in Lücken platziert.</span>
            ) : null}
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
                  <span
                    className={[
                      "cloze-drop-slot",
                      selectedKey && !isChecked ? "cloze-select--selected" : "",
                      isChecked && isCorrect ? "cloze-select--correct" : "",
                      isChecked && selectedKey && !isCorrect ? "cloze-select--wrong" : "",
                      activeDropBlankKey === blankKey ? "cloze-drop-slot--active" : "",
                    ].filter(Boolean).join(" ")}
                    onDragOver={(event) => {
                      if (!draggedOptionKey) {
                        return;
                      }
                      event.preventDefault();
                      setActiveDropBlankKey(blankKey);
                    }}
                    onDragLeave={() => {
                      setActiveDropBlankKey((previous) => (previous === blankKey ? "" : previous));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedOptionKey) {
                        assignOptionToBlank(blankKey, draggedOptionKey, dragSourceBlankKey);
                      }
                      setSaveStateText("");
                      handleDragEnd();
                    }}
                  >
                    {selectedKey ? (
                      <button
                        type="button"
                        draggable={!isChecked}
                        className={[
                          "cloze-drop-slot__chip",
                          isChecked && isCorrect ? "cloze-drop-slot__chip--correct" : "",
                          isChecked && selectedKey && !isCorrect ? "cloze-drop-slot__chip--wrong" : "",
                        ].filter(Boolean).join(" ")}
                        onDragStart={() => {
                          handleDragStart(selectedKey, blankKey);
                        }}
                        onDragEnd={handleDragEnd}
                      >
                        {optionMap[selectedKey]?.option_text || selectedKey}
                      </button>
                    ) : (
                      <span className="cloze-drop-slot__placeholder">
                        Lücke {blank?.blank_number || ""}
                      </span>
                    )}
                  </span>
                  {isChecked ? (
                    <span className="cloze-inline-feedback-row">
                      <span
                        className={[
                          "cloze-inline-feedback",
                          isCorrect
                            ? "cloze-inline-feedback--correct"
                            : "cloze-inline-feedback--answer",
                        ].join(" ")}
                      >
                        {isCorrect ? "Richtig" : `Richtig: ${correctOption?.option_text || "-"}`}
                      </span>
                      {blank ? (
                        <ExerciseFavoriteButton
                          isFavorited={Boolean(favoritedByBlankId[blank.id])}
                          pending={Boolean(favoritePendingByBlankId[blank.id])}
                          onClick={() => {
                            toggleFavorite(blank);
                          }}
                        />
                      ) : null}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </section>

        <section className="cloze-actions">
          <span className="cloze-actions__meta">{answeredCount} / {blankAnswers.length} beantwortet</span>
          <div className="cloze-actions__buttons">
            <ExamActionButton
              className="cloze-check-btn"
              disabled={isChecked || !blankAnswers.length || answeredCount !== blankAnswers.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="cloze-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setSaveStateText("");
                }}
                label="Wiederholen"
                icon="rotate"
              />
            ) : null}
          </div>
        </section>
        {saveStateText ? <p className="cloze-state-note">{saveStateText}</p> : null}
      </div>
    </div>
  );
}
