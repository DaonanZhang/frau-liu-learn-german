import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import ScopedExplanation from "../components/examPreparation/ScopedExplanation.jsx";
import { hasScopedExplanation } from "../components/examPreparation/explanationVisibility.js";
import {
  AnnotatableTextRegion,
  ExamTextAnnotationProvider,
  useExamTextAnnotations,
} from "../components/examPreparation/ExamTextAnnotations.jsx";
import {
  domPointToTextOffset,
  exerciseAnnotationScope,
  findAnnotationSegmentAtOffset,
} from "../utils/examTextAnnotations.js";
import { useClozeAnnotationLayout } from "./clozeAnnotationLayout.js";
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

function ClozeChoiceResetAction({ onReset }) {
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

function pointerTextPoint(event) {
  const documentRef = event.currentTarget.ownerDocument;
  if (typeof documentRef.caretPositionFromPoint === "function") {
    const point = documentRef.caretPositionFromPoint(event.clientX, event.clientY);
    if (point) return { node: point.offsetNode, offset: point.offset };
  }
  if (typeof documentRef.caretRangeFromPoint === "function") {
    const range = documentRef.caretRangeFromPoint(event.clientX, event.clientY);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

function pointerHitsAnnotation(event, state) {
  const region = event.target.closest?.("[data-exam-annotation-region]");
  if (!region) return false;
  const point = pointerTextPoint(event);
  if (!point) return false;
  const offset = domPointToTextOffset(region, point.node, point.offset);
  return offset !== null
    && Boolean(findAnnotationSegmentAtOffset(state.regions[region.dataset.examAnnotationRegion] || [], offset));
}

function ClozeChoiceSlotTrigger({
  blank,
  selectedKey,
  isChecked,
  isCorrect,
  expanded,
  onOpen,
}) {
  const { state } = useExamTextAnnotations();
  const suppressChoiceClickRef = useRef(false);
  const selectedOption = (blank?.options || []).find((option) => option.option_key === selectedKey);

  return (
    <button
      type="button"
      className={[
        "cloze-choice-slot-trigger",
        selectedKey ? "cloze-drop-slot__chip" : "cloze-choice-slot-trigger--empty",
        isChecked && isCorrect ? "cloze-drop-slot__chip--correct" : "",
        isChecked && selectedKey && !isCorrect ? "cloze-drop-slot__chip--wrong" : "",
      ].filter(Boolean).join(" ")}
      onPointerDown={(event) => {
        suppressChoiceClickRef.current = pointerHitsAnnotation(event, state);
      }}
      onClick={() => {
        if (suppressChoiceClickRef.current) {
          suppressChoiceClickRef.current = false;
          return;
        }
        onOpen();
      }}
      aria-haspopup="dialog"
      aria-expanded={expanded}
    >
      {selectedKey
        ? expanded
          ? (selectedOption?.option_text || selectedKey)
          : (
          <span>{selectedOption?.option_text || selectedKey}</span>
          )
        : <span className="cloze-drop-slot__placeholder">{blank?.blank_number || ""}</span>}
    </button>
  );
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
          const blankCount = Array.isArray(detail?.blanks) ? detail.blanks.length : 0;
          setAnswers(nextAnswers);
          setIsChecked(blankCount > 0 && Object.keys(nextAnswers).length === blankCount);
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

  const {
    annotationLayout,
    clozeTextRef,
    blankRefs,
    detailsRefs,
  } = useClozeAnnotationLayout({ blanks, isChecked, paragraphs });

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

  async function handleCheck() {
    setIsChecked(true);

    try {
      await Promise.all(
        blanks.map((blank) => {
          const selectedOptionKey = answers[blank.blank_key] || "";
          const selectedOption = (blank.options || []).find(
            (option) => option.option_key === selectedOptionKey
          );
          return saveClozeChoiceBlankState({
            blank: blank.id,
            is_favorited: Boolean(favoritedByBlankId[blank.id]),
            answer_payload: {
              selected_option_key: selectedOptionKey,
            },
            is_correct: selectedOption ? Boolean(selectedOption.is_correct) : false,
          });
        })
      );
    } catch (error) {
      setErrorText(error?.message || "Antworten konnten nicht gespeichert werden.");
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
          <Link to="/modules/exam-preparation/sprachbausteine/cloze-choice" className="cloze-topbar__back">
            ← Zurück zu Sprachbausteine
          </Link>
          <span className="cloze-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="cloze-hero">
          <h1 className="cloze-hero__title">{heroTitle}</h1>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="cloze-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="cloze-hero__badge cloze-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty ? (
                <span className="cloze-hero__badge">
                  难度：{exercise.exercise_base.level || exercise.exercise_base.difficulty}
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
                        flowId={`cloze-choice:paragraph:${paragraphIndex}`}
                      >
                        {part}
                      </AnnotatableTextRegion>
                    );
                  }
                  const blankKey = extractBlankKey(part);
                  const blank = blankMap[blankKey];
                  const correctOption = (blank?.options || []).find((option) => option.is_correct);
                  const selectedKey = answers[blankKey] || "";
                  const isCorrect = !!correctOption && selectedKey === correctOption.option_key;
                  const annotationPosition = annotationLayout[blankKey];
                  const followingText = parts[index + 1] && !/^\{\{blank_\d+\}\}$/.test(parts[index + 1])
                    ? parts[index + 1]
                    : "";

                  return (
                    <Fragment key={blankKey}>
                    <span
                      ref={(node) => {
                        blankRefs.current[blankKey] = node;
                      }}
                      className="cloze-blank-inline"
                    >
                      <span
                        className={[
                          "cloze-drop-slot",
                          !selectedKey ? "cloze-drop-slot--empty" : "",
                          selectedKey ? "cloze-drop-slot--selected" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <ClozeChoiceSlotTrigger
                          blank={blank}
                          selectedKey={selectedKey}
                          isChecked={isChecked}
                          isCorrect={isCorrect}
                          expanded={activeBlankKey === blankKey}
                          onOpen={() => {
                            setActiveBlankKey(blankKey);
                          }}
                        />
                      </span>
                      <ExerciseOptionSheet
                        open={activeBlankKey === blankKey}
                        title={`${blank?.blank_number || ""}`}
                        subtitle="请选择当前空格的答案。"
                        selectedValue={selectedKey}
                        options={blank?.options?.map((option) => ({
                          value: option.option_key,
                          id: option.id,
                          label: option.option_text,
                        })) || []}
                        renderOptionLabel={(option) => (
                          <span>{option.label}</span>
                        )}
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
                          className="cloze-blank-inline__annotation"
                          style={annotationPosition ? {
                            "--cloze-annotation-reserve-height": `${annotationPosition.reserveHeight}px`,
                          } : undefined}
                        >
                          <span
                            ref={(node) => {
                              detailsRefs.current[blankKey] = node;
                            }}
                            className="cloze-choice-inline-details"
                            style={annotationPosition ? {
                              "--cloze-annotation-x-offset": `${annotationPosition.xOffset}px`,
                              "--cloze-annotation-lane-offset": `${annotationPosition.laneOffset}px`,
                              ...(annotationPosition.width > 0
                                ? { width: `${annotationPosition.width}px` }
                                : {}),
                            } : undefined}
                          >
                            <span className="cloze-choice-inline-result">
                              <span
                                className={[
                                  "cloze-inline-feedback",
                                  isCorrect ? "cloze-inline-feedback--correct" : "cloze-inline-feedback--wrong",
                                ].join(" ")}
                              >
                                {isCorrect ? "Richtig" : `Richtig: ${correctOption?.option_text || "-"}`}
                              </span>
                              <ExerciseFavoriteButton
                                isFavorited={Boolean(favoritedByBlankId[blank.id])}
                                pending={Boolean(favoritePendingByBlankId[blank.id])}
                                onClick={() => {
                                  toggleFavorite(blank);
                                }}
                              />
                            </span>
                            {hasScopedExplanation(blank.explanation, blank.options || []) ? (
                              <span className="cloze-choice-inline-explanation">
                                Erklärung:{" "}
                                <span>
                                  <ScopedExplanation
                                    explanation={blank.explanation}
                                    explanationScope={blank.explanation_scope}
                                    options={blank.options || []}
                                  />
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
                        flowId={`cloze-choice:paragraph:${paragraphIndex}`}
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

        <section className="cloze-actions">
          <div className="cloze-actions__buttons">
            <ExamActionButton
              className="cloze-check-btn"
              disabled={isChecked || !blanks.length || answeredCount !== blanks.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ClozeChoiceResetAction
                onReset={() => {
                  setAnswers({});
                  setIsChecked(false);
                }}
              />
            ) : null}
          </div>
        </section>
        </div>
      </div>
    </ExamTextAnnotationProvider>
  );
}
