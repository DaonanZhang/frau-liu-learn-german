import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchSpeakingPromptSegmentedExerciseDetail,
  fetchSpeakingPromptSegmentedExerciseStates,
  saveSpeakingPromptSegmentedExerciseState,
} from "../api/exam_preparation/speakingExercises.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import SpeakingPracticeRecorder from "../components/examPreparation/SpeakingPracticeRecorder.jsx";
import "./SpeakingExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Ordnen Sie die Abschnitte des Beispieltexts in eine sinnvolle Reihenfolge.";

function shuffleSegments(items) {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  const stayedInOriginalOrder = nextItems.every(
    (item, index) => item.id === items[index]?.id
  );
  if (stayedInOriginalOrder && nextItems.length > 1) {
    nextItems.push(nextItems.shift());
  }
  return nextItems;
}

function restoreSegmentOrder(segments, orderedSegmentIds) {
  if (!Array.isArray(orderedSegmentIds) || orderedSegmentIds.length !== segments.length) {
    return null;
  }
  const segmentMap = new Map(segments.map((segment) => [String(segment.id), segment]));
  const restored = orderedSegmentIds.map((segmentId) => segmentMap.get(String(segmentId)));
  return restored.every(Boolean) && new Set(restored.map((segment) => segment.id)).size === segments.length
    ? restored
    : null;
}

function findSegmentAtPointer(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  return target?.closest("[data-segment-id]")?.dataset.segmentId || "";
}

export default function SpeakingPromptSegmentedPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [displaySegments, setDisplaySegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [saveStateText, setSaveStateText] = useState("");
  const [saveErrorText, setSaveErrorText] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [draggedSegmentId, setDraggedSegmentId] = useState("");
  const [dragOverSegmentId, setDragOverSegmentId] = useState("");
  const [touchDragPosition, setTouchDragPosition] = useState(null);
  const touchDragRef = useRef(null);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");
        setSaveStateText("");
        setSaveErrorText("");

        if (!exerciseId) {
          throw new Error("No speaking prompt segmented exercise selected.");
        }

        const detail = await fetchSpeakingPromptSegmentedExerciseDetail(exerciseId);
        if (aborted) {
          return;
        }

        const segments = Array.isArray(detail?.segments) ? detail.segments : [];
        setExercise(detail || null);
        setDisplaySegments(shuffleSegments(segments));

        const stateData = await fetchSpeakingPromptSegmentedExerciseStates(exerciseId);
        if (aborted) {
          return;
        }

        const firstState = Array.isArray(stateData?.results) ? stateData.results[0] : null;
        if (firstState) {
          setIsFavorited(Boolean(firstState.is_favorited));
        }
        const restoredSegments = restoreSegmentOrder(
          segments,
          firstState?.answer_payload?.ordered_segment_ids
        );
        if (restoredSegments) {
          setDisplaySegments(restoredSegments);
          setIsChecked(true);
          setSaveStateText("已恢复上次 Prüfen 后的排序结果。");
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Failed to load speaking segmented exercise.");
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

  const segments = useMemo(
    () => (Array.isArray(exercise?.segments) ? exercise.segments : []),
    [exercise]
  );
  const correctSegments = useMemo(
    () => [...segments].sort(
      (left, right) => Number(left.segment_order) - Number(right.segment_order)
    ),
    [segments]
  );
  const orderedSegmentIds = useMemo(
    () => displaySegments.map((segment) => segment.id),
    [displaySegments]
  );
  const isOrderCorrect = useMemo(
    () =>
      displaySegments.length === correctSegments.length &&
      displaySegments.every(
        (segment, index) => String(segment.id) === String(correctSegments[index]?.id)
      ),
    [correctSegments, displaySegments]
  );
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);

  function moveSegment(sourceSegmentId, targetSegmentId) {
    if (!sourceSegmentId || !targetSegmentId || sourceSegmentId === targetSegmentId) {
      return;
    }
    setDisplaySegments((previous) => {
      const sourceIndex = previous.findIndex(
        (segment) => String(segment.id) === String(sourceSegmentId)
      );
      const targetIndex = previous.findIndex(
        (segment) => String(segment.id) === String(targetSegmentId)
      );
      if (sourceIndex < 0 || targetIndex < 0) {
        return previous;
      }
      const nextSegments = [...previous];
      const [movedSegment] = nextSegments.splice(sourceIndex, 1);
      nextSegments.splice(targetIndex, 0, movedSegment);
      return nextSegments;
    });
    if (isChecked) {
      setIsChecked(false);
    }
    setSaveStateText("");
    setSaveErrorText("");
  }

  function moveSegmentByOffset(segmentId, offset) {
    const sourceIndex = displaySegments.findIndex(
      (segment) => String(segment.id) === String(segmentId)
    );
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= displaySegments.length) {
      return;
    }
    moveSegment(segmentId, displaySegments[targetIndex].id);
  }

  function clearDragState() {
    setDraggedSegmentId("");
    setDragOverSegmentId("");
    setTouchDragPosition(null);
  }

  function handlePointerDragStart(event, segmentId) {
    if (event.pointerType === "mouse" || isChecked) {
      return;
    }
    event.preventDefault();
    touchDragRef.current = {
      pointerId: event.pointerId,
      segmentId: String(segmentId),
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggedSegmentId(String(segmentId));
    setTouchDragPosition({ x: event.clientX, y: event.clientY });
  }

  function handlePointerDragMove(event) {
    const touchDrag = touchDragRef.current;
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    setTouchDragPosition({ x: event.clientX, y: event.clientY });
    setDragOverSegmentId(findSegmentAtPointer(event.clientX, event.clientY));

    const scrollEdge = 72;
    if (event.clientY < scrollEdge) {
      window.scrollBy({ top: -14, behavior: "auto" });
    } else if (event.clientY > window.innerHeight - scrollEdge) {
      window.scrollBy({ top: 14, behavior: "auto" });
    }
  }

  function handlePointerDragEnd(event, cancelled = false) {
    const touchDrag = touchDragRef.current;
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    if (!cancelled) {
      moveSegment(
        touchDrag.segmentId,
        findSegmentAtPointer(event.clientX, event.clientY)
      );
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    touchDragRef.current = null;
    clearDragState();
  }

  async function handleCheck() {
    setIsChecked(true);
    setSaveStateText("保存状态中...");
    setSaveErrorText("");

    try {
      await saveSpeakingPromptSegmentedExerciseState({
        exercise: exercise.id,
        answer_payload: {
          ordered_segment_ids: orderedSegmentIds,
        },
        is_correct: isOrderCorrect,
      });
      setSaveStateText("已保存当前 Prüfen 结果。");
    } catch (error) {
      setSaveStateText("");
      setSaveErrorText(error?.message || "保存状态失败。");
    }
  }

  async function toggleFavorite() {
    if (!exercise?.id) {
      return;
    }
    const nextValue = !isFavorited;
    setFavoritePending(true);
    try {
      await saveSpeakingPromptSegmentedExerciseState({
        exercise: exercise.id,
        is_favorited: nextValue,
      });
      setIsFavorited(nextValue);
    } catch (error) {
      setSaveStateText("");
      setSaveErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePending(false);
    }
  }

  if (loading) {
    return (
      <div className="speaking-page">
        <div className="speaking-shell">
          <p className="speaking-loading">Loading speaking segmented exercise...</p>
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
          <Link to="/modules/exam-preparation/sprechen/prompt-segmented" className="speaking-topbar__back">
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
          <div className="speaking-prompt-block">
            <h2>Aufgabe</h2>
            <p>{exercise?.prompt_text || "Keine Aufgabe verfügbar."}</p>
          </div>

          <div className="speaking-segment-panel__header">
            <h2>Abschnitte ordnen</h2>
            <p>Ziehen Sie die Abschnitte in die richtige Reihenfolge.</p>
          </div>

          <div className="speaking-segment-grid" aria-label="Abschnitte sortieren">
            {displaySegments.map((segment, index) => (
              <article
                key={segment.id}
                data-segment-id={segment.id}
                draggable={!isChecked}
                className={[
                  "speaking-segment-card",
                  !isChecked ? "speaking-segment-card--draggable" : "",
                  String(draggedSegmentId) === String(segment.id)
                    ? "speaking-segment-card--dragging"
                    : "",
                  String(dragOverSegmentId) === String(segment.id) &&
                  String(draggedSegmentId) !== String(segment.id)
                    ? "speaking-segment-card--drag-over"
                    : "",
                ].filter(Boolean).join(" ")}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(segment.id));
                  setDraggedSegmentId(String(segment.id));
                }}
                onDragOver={(event) => {
                  if (!draggedSegmentId || isChecked) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverSegmentId(String(segment.id));
                }}
                onDragLeave={() => {
                  setDragOverSegmentId((previous) =>
                    String(previous) === String(segment.id) ? "" : previous
                  );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveSegment(
                    draggedSegmentId || event.dataTransfer.getData("text/plain"),
                    String(segment.id)
                  );
                  clearDragState();
                }}
                onDragEnd={clearDragState}
              >
                <div className="speaking-segment-card__top speaking-segment-card__top--sortable">
                  <span className="speaking-segment-card__position" aria-label={`Position ${index + 1}`}>
                    {index + 1}
                  </span>
                  <span className="speaking-segment-card__label">Abschnitt</span>
                  <button
                    type="button"
                    className="speaking-segment-card__drag-handle"
                    aria-label={`Abschnitt an Position ${index + 1} verschieben`}
                    disabled={isChecked}
                    onPointerDown={(event) => {
                      handlePointerDragStart(event, segment.id);
                    }}
                    onPointerMove={handlePointerDragMove}
                    onPointerUp={handlePointerDragEnd}
                    onPointerCancel={(event) => {
                      handlePointerDragEnd(event, true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveSegmentByOffset(segment.id, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveSegmentByOffset(segment.id, 1);
                      }
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="8" cy="6" r="1.6" />
                      <circle cx="16" cy="6" r="1.6" />
                      <circle cx="8" cy="12" r="1.6" />
                      <circle cx="16" cy="12" r="1.6" />
                      <circle cx="8" cy="18" r="1.6" />
                      <circle cx="16" cy="18" r="1.6" />
                    </svg>
                  </button>
                </div>
                <div className="speaking-segment-card__text">{segment.segment_text}</div>
              </article>
            ))}
          </div>

          {isChecked ? (
            <div
              className={[
                "speaking-order-feedback",
                isOrderCorrect
                  ? "speaking-order-feedback--correct"
                  : "speaking-order-feedback--wrong",
              ].join(" ")}
              role="status"
            >
              <div className="speaking-order-feedback__header">
                <div>
                  <strong>{isOrderCorrect ? "Richtig" : "Falsch"}</strong>
                  <p>
                    {isOrderCorrect
                      ? "Alle Abschnitte stehen in der richtigen Reihenfolge."
                      : "Mindestens ein Abschnitt steht an der falschen Position."}
                  </p>
                </div>
                {isOrderCorrect ? (
                  <ExerciseFavoriteButton
                    isFavorited={isFavorited}
                    pending={favoritePending}
                    onClick={toggleFavorite}
                    label="收藏全文"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {isChecked && !isOrderCorrect ? (
            <section className="speaking-correct-article">
              <div className="speaking-correct-article__header">
                <h2>Richtige Reihenfolge</h2>
                <ExerciseFavoriteButton
                  isFavorited={isFavorited}
                  pending={favoritePending}
                  onClick={toggleFavorite}
                  label="收藏全文"
                />
              </div>
              <div className="speaking-correct-article__segments">
                {correctSegments.map((segment, index) => (
                  <article key={segment.id} className="speaking-correct-article__segment">
                    <span>{index + 1}</span>
                    <p>{segment.segment_text}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {isChecked ? <SpeakingPracticeRecorder /> : null}

          {saveStateText ? <div className="speaking-state">{saveStateText}</div> : null}
          {saveErrorText ? <div className="speaking-state speaking-state--error">{saveErrorText}</div> : null}
        </section>

        {touchDragPosition && draggedSegmentId ? (
          <div
            className="speaking-segment-drag-preview"
            style={{ left: touchDragPosition.x, top: touchDragPosition.y }}
            aria-hidden="true"
          >
            {displaySegments.find(
              (segment) => String(segment.id) === String(draggedSegmentId)
            )?.segment_text}
          </div>
        ) : null}

        <section className="speaking-actions">
          <div className="speaking-actions__buttons">
            <ExamActionButton
              className="speaking-check-btn"
              disabled={isChecked || !displaySegments.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="speaking-reset-btn"
                onClick={() => {
                  setIsChecked(false);
                  setSaveStateText("");
                  setSaveErrorText("");
                  setDisplaySegments(shuffleSegments(segments));
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
