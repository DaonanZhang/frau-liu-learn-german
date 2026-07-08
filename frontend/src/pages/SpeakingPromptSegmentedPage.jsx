import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchSpeakingPromptSegmentedExerciseDetail,
  fetchSpeakingPromptSegmentedExerciseStates,
  saveSpeakingPromptSegmentedExerciseState,
} from "../api/exam_preparation/speakingExercises.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseOptionSheet from "../components/examPreparation/ExerciseOptionSheet.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import "./SpeakingExercisePage.css";

const FALLBACK_INSTRUCTION =
  "Ordnen Sie die Abschnitte des Beispieltexts in eine sinnvolle Reihenfolge.";

function shuffleSegments(items) {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
}

export default function SpeakingPromptSegmentedPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [displaySegments, setDisplaySegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [saveStateText, setSaveStateText] = useState("");
  const [saveErrorText, setSaveErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState("");

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
        const selectedOrderBySegmentId = firstState?.answer_payload?.selected_order_by_segment_id;
        if (firstState) {
          setIsFavorited(Boolean(firstState.is_favorited));
        }
        if (selectedOrderBySegmentId && typeof selectedOrderBySegmentId === "object") {
          setAnswers(selectedOrderBySegmentId);
          setIsChecked(true);
          setSaveStateText("已恢复上次 Prüfen 后的作答状态。");
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

  const segments = useMemo(() => (Array.isArray(exercise?.segments) ? exercise.segments : []), [exercise]);
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);
  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => String(value || "").trim()).length,
    [answers]
  );
  const totalCount = segments.length;
  const activeSegment = activeSegmentId
    ? displaySegments.find((segment) => String(segment.id) === String(activeSegmentId))
    : null;

  const normalizedAnswers = useMemo(() => {
    const nextAnswers = {};
    Object.entries(answers).forEach(([segmentId, orderValue]) => {
      nextAnswers[segmentId] = Number(orderValue);
    });
    return nextAnswers;
  }, [answers]);

  async function handleCheck() {
    const isCorrect = segments.every(
      (segment) => Number(normalizedAnswers[segment.id]) === Number(segment.segment_order)
    );
    setIsChecked(true);
    setSaveStateText("保存状态中...");
    setSaveErrorText("");

    try {
      await saveSpeakingPromptSegmentedExerciseState({
        exercise: exercise.id,
        answer_payload: {
          selected_order_by_segment_id: normalizedAnswers,
        },
        is_correct: isCorrect,
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
        answer_payload: {
          selected_order_by_segment_id: normalizedAnswers,
        },
        is_correct: segments.every(
          (segment) => Number(normalizedAnswers[segment.id]) === Number(segment.segment_order)
        ),
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
          {exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="speaking-hero__badges">
              {exercise?.exercise_base?.difficulty ? (
                <span className="speaking-hero__badge">
                  难度：{exercise.exercise_base.difficulty}
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
            <p>Wählen Sie für jeden Abschnitt die richtige Reihenfolge.</p>
          </div>

          <div className="speaking-segment-grid">
            {displaySegments.map((segment) => {
              const selectedOrder = answers[segment.id] || "";
              const isCorrect = Number(selectedOrder) === Number(segment.segment_order);
              return (
                <article
                  key={segment.id}
                  className={[
                    "speaking-segment-card",
                    isChecked && isCorrect ? "speaking-segment-card--correct" : "",
                    isChecked && selectedOrder && !isCorrect ? "speaking-segment-card--wrong" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className="speaking-segment-card__top">
                    <span className="speaking-segment-card__label">Abschnitt</span>
                    <button
                      type="button"
                      className={[
                        "speaking-select",
                        "speaking-select-trigger",
                        selectedOrder && !isChecked ? "speaking-select--selected" : "",
                        isChecked && isCorrect ? "speaking-select--correct" : "",
                        isChecked && selectedOrder && !isCorrect ? "speaking-select--wrong" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => {
                        setActiveSegmentId(String(segment.id));
                      }}
                      aria-haspopup="dialog"
                      aria-expanded={String(activeSegmentId) === String(segment.id)}
                    >
                      {selectedOrder || "Reihenfolge wählen"}
                    </button>
                    <ExerciseOptionSheet
                      open={String(activeSegmentId) === String(segment.id)}
                      title="Reihenfolge wählen"
                      subtitle="请选择当前段落的顺序。"
                      selectedValue={selectedOrder}
                      options={segments.map((_, index) => ({
                        value: String(index + 1),
                        label: `第 ${index + 1} 位`,
                      }))}
                      onClose={() => {
                        setActiveSegmentId("");
                      }}
                      onSelect={(nextValue) => {
                        if (isChecked) {
                          setIsChecked(false);
                        }
                        setSaveStateText("");
                        setSaveErrorText("");
                        setAnswers((previous) => ({
                          ...previous,
                          [segment.id]: nextValue,
                        }));
                      }}
                    />
                  </div>

                  <div className="speaking-segment-card__text">{segment.segment_text}</div>

                  {isChecked ? (
                    <div
                      className={[
                        "speaking-inline-feedback",
                        isCorrect ? "speaking-inline-feedback--correct" : "speaking-inline-feedback--wrong",
                      ].join(" ")}
                    >
                      {isCorrect ? "Richtig" : `Richtige Position: ${segment.segment_order}`}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {saveStateText ? <div className="speaking-state">{saveStateText}</div> : null}
          {saveErrorText ? <div className="speaking-state speaking-state--error">{saveErrorText}</div> : null}
        </section>

        <section className="speaking-actions">
          <div className="speaking-actions__buttons">
            {isChecked ? (
              <ExerciseFavoriteButton
                isFavorited={isFavorited}
                pending={favoritePending}
                onClick={toggleFavorite}
              />
            ) : null}
            <ExamActionButton
              className="speaking-check-btn"
              disabled={isChecked || !segments.length || answeredCount !== totalCount}
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
