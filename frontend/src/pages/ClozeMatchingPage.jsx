import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import {
  fetchClozeMatchingExerciseDetail,
} from "../api/exam_preparation/clozeExercises.js";
import {
  fetchClozeMatchingBlankStates,
  saveClozeMatchingBlankState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import FormattedExplanation from "../components/examPreparation/FormattedExplanation.jsx";
import {
  AnnotatableTextRegion,
  ExamTextAnnotationProvider,
  useExamTextAnnotations,
} from "../components/examPreparation/ExamTextAnnotations.jsx";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import { useClozeAnnotationLayout } from "./clozeAnnotationLayout.js";
import "./ClozeExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den folgenden Text. Welcher Ausdruck passt am besten in die Lücken?";

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

function findPointerDropTarget(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const blankElement = target?.closest("[data-cloze-blank-key]");
  return {
    blankKey: blankElement?.dataset.clozeBlankKey || "",
    isPool: Boolean(target?.closest("[data-cloze-pool]")),
  };
}

function ClozeMatchingResetAction({ onReset }) {
  const { clearAnnotations } = useExamTextAnnotations();

  return (
    <ExamActionButton
      className="cloze-reset-btn"
      onClick={() => {
        onReset();
        clearAnnotations();
      }}
      label="Wiederholen"
      icon="rotate"
    />
  );
}

export default function ClozeMatchingPage() {
  const { exerciseId } = useParams();
  const scope = examPreparationScope(useParams().level);
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
  const [touchDragPosition, setTouchDragPosition] = useState(null);
  const touchDragRef = useRef(null);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        setSaveStateText("");
        if (!exerciseId) {
          throw new Error("No cloze matching exercise selected.");
        }
        const detail = await fetchClozeMatchingExerciseDetail(exerciseId, scope);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchClozeMatchingBlankStates(exerciseId);
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
          const blankCount = Array.isArray(detail?.blank_answers) ? detail.blank_answers.length : 0;
          const hasCompleteSavedAttempt = blankCount > 0 && Object.keys(nextAnswers).length === blankCount;
          setAnswers(nextAnswers);
          setIsChecked(hasCompleteSavedAttempt);
          if (hasCompleteSavedAttempt) {
            setSaveStateText("已恢复上次批改后的作答状态。");
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
  }, [exerciseId]);

  const options = useMemo(() => Array.isArray(exercise?.options) ? exercise.options : [], [exercise]);
  const blankAnswers = useMemo(() => Array.isArray(exercise?.blank_answers) ? exercise.blank_answers : [], [exercise]);
  const blankMap = useMemo(
    () => Object.fromEntries(blankAnswers.map((blank) => [blank.blank_key, blank])),
    [blankAnswers]
  );
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);
  const optionMap = useMemo(
    () => Object.fromEntries(options.map((option) => [option.option_key, option])),
    [options]
  );
  const answeredCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);
  const paragraphs = useMemo(() => renderParagraphs(exercise?.content_with_placeholders), [exercise]);
  const assignedOptionKeys = useMemo(
    () => new Set(Object.values(answers).filter(Boolean)),
    [answers]
  );
  const poolOptions = useMemo(
    () => options.filter((option) => !assignedOptionKeys.has(option.option_key)),
    [options, assignedOptionKeys]
  );

  const {
    annotationLayout,
    clozeTextRef,
    blankRefs,
    detailsRefs,
  } = useClozeAnnotationLayout({ blanks: blankAnswers, isChecked, paragraphs });

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
    setTouchDragPosition(null);
  }

  function handlePointerDragStart(event, optionKey, sourceBlankKey = "") {
    if (event.pointerType === "mouse" || isChecked) {
      return;
    }
    event.preventDefault();
    touchDragRef.current = {
      pointerId: event.pointerId,
      optionKey,
      sourceBlankKey,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTouchDragPosition({ x: event.clientX, y: event.clientY });
    handleDragStart(optionKey, sourceBlankKey);
  }

  function handlePointerDragMove(event) {
    const touchDrag = touchDragRef.current;
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setTouchDragPosition({ x: event.clientX, y: event.clientY });
    const dropTarget = findPointerDropTarget(event.clientX, event.clientY);
    setActiveDropBlankKey(dropTarget.blankKey);
    setIsPoolDropActive(dropTarget.isPool && Boolean(touchDrag.sourceBlankKey));
  }

  function handlePointerDragEnd(event, cancelled = false) {
    const touchDrag = touchDragRef.current;
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    if (!cancelled) {
      const dropTarget = findPointerDropTarget(event.clientX, event.clientY);
      if (dropTarget.blankKey) {
        assignOptionToBlank(
          dropTarget.blankKey,
          touchDrag.optionKey,
          touchDrag.sourceBlankKey
        );
        setSaveStateText("");
      } else if (dropTarget.isPool && touchDrag.sourceBlankKey) {
        clearBlankAssignment(touchDrag.sourceBlankKey);
        setSaveStateText("");
      }
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    touchDragRef.current = null;
    handleDragEnd();
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
    setSaveStateText("正在保存作答状态...");

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
      setSaveStateText("已保存本次批改结果。");
    } catch (error) {
      setErrorText(error?.message || "状态保存失败。");
      setSaveStateText("");
    }
  }

  if (loading) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-loading">练习加载中...</p></div></div>;
  }

  if (errorText) {
    return <div className="cloze-page"><div className="cloze-shell"><p className="cloze-error">{errorText}</p></div></div>;
  }

  return (
    <ExamTextAnnotationProvider
      scope={exerciseAnnotationScope(exercise.exercise_base.exercise_type, exercise.id)}
    >
      <div className="cloze-page">
        <div className="cloze-shell">
        <div className="cloze-topbar">
          <Link to={`/modules/exam-preparation/${scope?.levelPath || "b1"}/sprachbausteine/cloze-matching`} className="cloze-topbar__back">
            ← Zurück zu Sprachbausteine
          </Link>
          <span className="cloze-topbar__meta">
            {exercise?.exercise_base?.level || scope?.level} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="cloze-hero">
          <h1 className="cloze-hero__title">{heroTitle}</h1>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || scope?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="cloze-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="cloze-hero__badge cloze-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || scope?.level || exercise?.exercise_base?.difficulty ? (
                <span className="cloze-hero__badge">
                  难度：{exercise.exercise_base.level || scope?.level || exercise.exercise_base.difficulty}
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
            <AnnotatableTextRegion as="p" regionId="task">
              {FALLBACK_INSTRUCTION}
            </AnnotatableTextRegion>
          </section>

        <section className="cloze-pool-panel">
          <div className="cloze-section-heading">
            <span className="cloze-section-label">选项区</span>
            <span className="cloze-section-meta">拖动到对应空格中</span>
          </div>
          <div
            data-cloze-pool
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
                className={[
                  "cloze-pool-chip",
                  !isChecked ? "cloze-draggable-chip" : "",
                  option.is_extra ? "cloze-pool-chip--extra" : "",
                ].filter(Boolean).join(" ")}
                draggable={!isChecked}
                onDragStart={() => handleDragStart(option.option_key, "")}
                onDragEnd={handleDragEnd}
                onPointerDown={(event) => {
                  handlePointerDragStart(event, option.option_key, "");
                }}
                onPointerMove={handlePointerDragMove}
                onPointerUp={handlePointerDragEnd}
                onPointerCancel={(event) => {
                  handlePointerDragEnd(event, true);
                }}
              >
                <span>
                  {option.option_text}
                </span>
              </button>
            ))}
            {!poolOptions.length ? (
              <span className="cloze-pool__empty">Alle Optionen sind gerade in Lücken platziert.</span>
            ) : null}
          </div>
        </section>

          <section className="cloze-text-panel">
            <div className="cloze-text" ref={clozeTextRef}>
            {paragraphs.map((parts, paragraphIndex) => (
              <p key={`paragraph-${paragraphIndex}`} className="cloze-text__paragraph">
                {parts.map((part, index) => {
                  if (!/^\{\{blank_\d+\}\}$/.test(part)) {
                    if (/^\{\{blank_\d+\}\}$/.test(parts[index - 1] || "")) {
                      return null;
                    }
                    return (
                      <AnnotatableTextRegion
                        key={`${paragraphIndex}-${part}-${index}`}
                        as="span"
                        regionId={`source:${paragraphIndex}:${index}`}
                        flowId={`cloze-matching:paragraph:${paragraphIndex}`}
                      >
                        {part}
                      </AnnotatableTextRegion>
                    );
                  }
                  const blankKey = extractBlankKey(part);
                  const blank = blankMap[blankKey];
                  const correctOption = blank?.correct_option;
                  const selectedKey = answers[blankKey] || "";
                  const isCorrect = !!correctOption && selectedKey === correctOption.option_key;
                  const followingText = parts[index + 1] && !/^\{\{blank_\d+\}\}$/.test(parts[index + 1])
                    ? parts[index + 1]
                    : "";

                  return (
                    <Fragment key={`${blankKey}:${paragraphIndex}:${index}`}>
                    <span
                      ref={(node) => {
                        blankRefs.current[blankKey] = node;
                      }}
                      className="cloze-blank-inline"
                    >
                      <span
                        data-cloze-blank-key={blankKey}
                        className={[
                          "cloze-drop-slot",
                          !selectedKey ? "cloze-drop-slot--empty" : "",
                          selectedKey ? "cloze-drop-slot--selected" : "",
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
                            className={[
                              "cloze-drop-slot__chip",
                              !isChecked ? "cloze-draggable-chip" : "",
                              isChecked && isCorrect ? "cloze-drop-slot__chip--correct" : "",
                              isChecked && selectedKey && !isCorrect ? "cloze-drop-slot__chip--wrong" : "",
                            ].filter(Boolean).join(" ")}
                            draggable={!isChecked}
                            onDragStart={() => handleDragStart(selectedKey, blankKey)}
                            onDragEnd={handleDragEnd}
                            onPointerDown={(event) => {
                              handlePointerDragStart(event, selectedKey, blankKey);
                            }}
                            onPointerMove={handlePointerDragMove}
                            onPointerUp={handlePointerDragEnd}
                            onPointerCancel={(event) => {
                              handlePointerDragEnd(event, true);
                            }}
                          >
                            <span>
                              {optionMap[selectedKey]?.option_text || selectedKey}
                            </span>
                          </button>
                        ) : (
                          <span className="cloze-drop-slot__placeholder">
                            {blank?.blank_number || ""}
                          </span>
                        )}
                      </span>
                      {isChecked ? (
                        <span
                          className="cloze-blank-inline__annotation"
                          style={annotationLayout[blankKey] ? {
                            "--cloze-annotation-reserve-height": `${annotationLayout[blankKey].reserveHeight}px`,
                          } : undefined}
                        >
                          <span
                            ref={(node) => {
                              detailsRefs.current[blankKey] = node;
                            }}
                            className="cloze-choice-inline-details"
                            style={annotationLayout[blankKey] ? {
                              "--cloze-annotation-x-offset": `${annotationLayout[blankKey].xOffset}px`,
                              "--cloze-annotation-lane-offset": `${annotationLayout[blankKey].laneOffset}px`,
                              ...(annotationLayout[blankKey].width > 0
                                ? { width: `${annotationLayout[blankKey].width}px` }
                                : {}),
                            } : undefined}
                          >
                            <span className="cloze-choice-inline-result">
                              <span
                                className={[
                                  "cloze-inline-feedback",
                                  isCorrect ? "cloze-inline-feedback--correct" : "cloze-inline-feedback--answer",
                                ].join(" ")}
                              >
                                {isCorrect
                                  ? "Richtig"
                                  : `Richtig: ${optionMap[correctOption?.option_key]?.option_text || correctOption?.option_text || "-"}`}
                              </span>
                              <ExerciseFavoriteButton
                                isFavorited={Boolean(favoritedByBlankId[blank.id])}
                                pending={Boolean(favoritePendingByBlankId[blank.id])}
                                onClick={() => {
                                  toggleFavorite(blank);
                                }}
                              />
                            </span>
                            {String(blank.explanation || "").trim() ? (
                              <span className="cloze-choice-inline-explanation">
                                Erklärung:{" "}
                                <span>
                                  <FormattedExplanation text={blank.explanation} />
                                </span>
                              </span>
                            ) : null}
                          </span>
                        </span>
                      ) : null}
                    </span>
                    {followingText ? (
                      <AnnotatableTextRegion
                        as="span"
                        regionId={`blank-context:${blank.id}`}
                        flowId={`cloze-matching:paragraph:${paragraphIndex}`}
                      >
                        {followingText}
                      </AnnotatableTextRegion>
                    ) : null}
                    </Fragment>
                  );
                })}
              </p>
            ))}
            </div>
          </section>

        {touchDragPosition && draggedOptionKey ? (
          <div
            className="cloze-touch-drag-preview"
            style={{ left: touchDragPosition.x, top: touchDragPosition.y }}
            aria-hidden="true"
          >
            {optionMap[draggedOptionKey]?.option_text || draggedOptionKey}
          </div>
        ) : null}

        <section className="cloze-actions">
          <div className="cloze-actions__buttons">
            <ExamActionButton
              className="cloze-check-btn"
              disabled={isChecked || !blankAnswers.length || answeredCount !== blankAnswers.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ClozeMatchingResetAction
                onReset={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setSaveStateText("");
                }}
              />
            ) : null}
          </div>
        </section>
        {saveStateText ? <p className="cloze-state-note">{saveStateText}</p> : null}
        </div>
      </div>
    </ExamTextAnnotationProvider>
  );
}
