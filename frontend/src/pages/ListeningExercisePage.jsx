import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchListeningExerciseDetail,
} from "../api/exam_preparation/listeningExercises.js";
import {
  fetchListeningQuestionStates,
  saveListeningQuestionState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import "./ListeningExercisePage.css";

const INSTRUCTION_BY_TYPE = {
  short_text_true_false_with_prep:
    "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1 - 5 richtig oder falsch sind. Lesen Sie jetzt die Aufgaben 1 - 5. Sie haben dazu 30 Sekunden Zeit.",
  short_text_true_false_once:
    "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
  dialog_true_false_twice:
    "Sie hören nun ein Gespräch. Dazu sollen Sie 10 Aufgaben lösen. Sie hören das Gespräch zweimal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function ListeningExercisePage({
  listeningType,
  eyebrow = "LISTENING",
  backTo = "/modules/exam-preparation/hoeren",
}) {
  const { exerciseId } = useParams();
  const audioRef = useRef(null);
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByQuestionId, setFavoritedByQuestionId] = useState({});
  const [favoritePendingByQuestionId, setFavoritePendingByQuestionId] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [repeatEnabled, setRepeatEnabled] = useState(false);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        if (!exerciseId) {
          throw new Error("No listening exercise selected.");
        }

        const detail = await fetchListeningExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchListeningQuestionStates(exerciseId);
          if (aborted) {
            return;
          }
          const nextAnswers = {};
          const nextFavorited = {};
          const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
          stateResults.forEach((stateItem) => {
            const questionId = stateItem?.question;
            const selectedOptionKey = stateItem?.answer_payload?.selected_option_key;
            if (questionId && selectedOptionKey) {
              nextAnswers[questionId] = selectedOptionKey;
            }
            if (questionId) {
              nextFavorited[questionId] = Boolean(stateItem?.is_favorited);
            }
          });
          setFavoritedByQuestionId(nextFavorited);
          if (Object.keys(nextAnswers).length > 0) {
            setAnswers(nextAnswers);
            setIsChecked(true);
          }
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Failed to load listening exercise.");
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

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return undefined;
    }

    audioElement.volume = volume;
    audioElement.playbackRate = playbackRate;
    audioElement.loop = repeatEnabled;

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handlePause);

    return () => {
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handlePause);
    };
  }, [volume, playbackRate, repeatEnabled]);

  const questions = useMemo(() => {
    return Array.isArray(exercise?.questions) ? exercise.questions : [];
  }, [exercise]);
  const heroTitle = useMemo(() => {
    const title = exercise?.exercise_base?.title?.trim();
    if (title) {
      return title;
    }
    return `题目 ${exercise?.exercise_base?.external_id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);

  async function togglePlayback() {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    if (audioElement.paused) {
      try {
        await audioElement.play();
      } catch (error) {
        setErrorText(error?.message || "Audio playback failed.");
      }
      return;
    }

    audioElement.pause();
  }

  function restartAudio() {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }
    audioElement.currentTime = 0;
    audioElement.play().catch((error) => {
      setErrorText(error?.message || "Audio playback failed.");
    });
  }

  async function toggleFavorite(question) {
    const nextValue = !favoritedByQuestionId[question.id];
    setFavoritePendingByQuestionId((previous) => ({ ...previous, [question.id]: true }));
    try {
      const selectedOptionKey = answers[question.id] || "";
      const selectedOption = (question.answer_options || []).find(
        (option) => option.option_key === selectedOptionKey
      );
      await saveListeningQuestionState({
        question: question.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_option_key: selectedOptionKey,
        },
        is_correct: selectedOption ? Boolean(selectedOption.is_correct) : null,
      });
      setFavoritedByQuestionId((previous) => ({ ...previous, [question.id]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByQuestionId((previous) => ({ ...previous, [question.id]: false }));
    }
  }

  if (loading) {
    return (
      <div className="listening-exercise-page">
        <div className="listening-exercise-shell">
          <p className="listening-exercise-loading">Übung wird geladen...</p>
        </div>
      </div>
    );
  }

  if (errorText && !exercise) {
    return (
      <div className="listening-exercise-page">
        <div className="listening-exercise-shell">
          <p className="listening-exercise-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="listening-exercise-page">
      <div className="listening-exercise-shell">
        <div className="listening-exercise-topbar">
          <Link to={backTo} className="listening-exercise-topbar__back">
            ← Zurück zu Hören
          </Link>
          <span className="listening-exercise-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="listening-exercise-hero">
          <div className="listening-exercise-hero__main">
            <h1 className="listening-exercise-hero__title">{heroTitle}</h1>
          </div>
          {exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="listening-exercise-hero__badges">
              {exercise?.exercise_base?.difficulty ? (
                <span className="listening-exercise-hero__badge">
                  难度：{exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="listening-exercise-hero__badge listening-exercise-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="listening-exercise-instruction">
          <div className="listening-exercise-instruction__header">
            <span className="listening-exercise-instruction__label">Anleitung</span>
          </div>
          <p>{INSTRUCTION_BY_TYPE[listeningType] || INSTRUCTION_BY_TYPE.short_text_true_false_once}</p>
        </section>

        <section className="listening-exercise-audio-panel">
          <div className="listening-exercise-audio-panel__header">
            <div>
              <p className="listening-exercise-audio-panel__eyebrow">Audio</p>
              <h2 className="listening-exercise-audio-panel__title">Hören und steuern</h2>
            </div>
            <span className="listening-exercise-audio-panel__status">
              {isPlaying ? "Wird abgespielt" : "Bereit"}
            </span>
          </div>

          <div className="listening-exercise-audio-player">
            <audio
              ref={audioRef}
              src={exercise?.audio_file_url || ""}
              preload="metadata"
              controls
              controlsList="nodownload noremoteplayback"
              onContextMenu={(event) => {
                event.preventDefault();
              }}
              onDragStart={(event) => {
                event.preventDefault();
              }}
            />
          </div>

          <div className="listening-exercise-controls" aria-label="Audiosteuerung">
            <button
              type="button"
              className="listening-exercise-control-btn"
              onClick={togglePlayback}
            >
              {isPlaying ? "Pause" : "Abspielen"}
            </button>
            <button
              type="button"
              className="listening-exercise-control-btn listening-exercise-control-btn--secondary"
              onClick={restartAudio}
            >
              Wieder abspielen
            </button>
            <label className="listening-exercise-slider">
              <span className="listening-exercise-control-label">Lautstärke</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(event) => {
                  setVolume(Number(event.target.value));
                }}
              />
              <strong>{Math.round(volume * 100)}%</strong>
            </label>
            <label className="listening-exercise-select">
              <span className="listening-exercise-control-label">Geschwindigkeit</span>
              <select
                value={playbackRate}
                onChange={(event) => {
                  setPlaybackRate(Number(event.target.value));
                }}
              >
                {SPEEDS.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
            </label>
            <label className="listening-exercise-repeat">
              <input
                type="checkbox"
                checked={repeatEnabled}
                onChange={(event) => {
                  setRepeatEnabled(event.target.checked);
                }}
              />
              <span>Repeat aktivieren</span>
            </label>
          </div>
        </section>

        <section className="listening-exercise-questions">
          <div className="listening-exercise-questions__header">
            <div>
              <h2>Aufgaben</h2>
              <p className="listening-exercise-questions__sub">
                Wähle pro Aufgabe genau eine Antwort aus.
              </p>
            </div>
          </div>

          <div className="listening-exercise-question-list">
            {questions.map((question) => {
              const selectedOption = (question.answer_options || []).find(
                (option) => option.option_key === answers[question.id]
              );
              const correctOption = (question.answer_options || []).find((option) => option.is_correct);
              const isQuestionCorrect = !!selectedOption?.is_correct;

              return (
                <article key={question.id} className="listening-exercise-question-card">
                  <div className="listening-exercise-question-card__header">
                    <div className="listening-exercise-question-card__titleWrap">
                      <span className="listening-exercise-question-card__number">
                        Aufgabe {question.question_number}
                      </span>
                      <h3>{question.question_text}</h3>
                    </div>
                    <span className="listening-exercise-question-card__selection">
                      {selectedOption ? `Ausgewählt: ${selectedOption.option_text}` : "Noch nicht gewählt"}
                    </span>
                  </div>

                  <div className="listening-exercise-option-grid">
                    {(question.answer_options || []).map((option) => {
                      const checked = answers[question.id] === option.option_key;
                      const isWrongSelected = isChecked && checked && !option.is_correct;
                      const shouldRevealCorrect = isChecked && option.is_correct;

                      return (
                        <label
                          key={option.id}
                          className={[
                            "listening-exercise-option",
                            checked && !isChecked ? "listening-exercise-option--selected" : "",
                            shouldRevealCorrect ? "listening-exercise-option--correct" : "",
                            isWrongSelected ? "listening-exercise-option--wrong" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <input
                            type="radio"
                            name={`listening-question-${question.id}`}
                            value={option.option_key}
                            checked={checked}
                            onChange={() => {
                              if (isChecked) {
                                setIsChecked(false);
                              }
                              setAnswers((previous) => ({
                                ...previous,
                                [question.id]: option.option_key,
                              }));
                            }}
                          />
                          <span className="listening-exercise-option__key">{option.option_text}</span>
                        </label>
                      );
                    })}
                  </div>

                  {isChecked ? (
                    <div
                      className={[
                        "listening-exercise-feedback",
                        isQuestionCorrect ? "listening-exercise-feedback--correct" : "listening-exercise-feedback--wrong",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="listening-exercise-feedback__header">
                        <strong className="listening-exercise-feedback__title">
                          {isQuestionCorrect ? "Richtig" : "Falsch"}
                        </strong>
                        <ExerciseFavoriteButton
                          isFavorited={Boolean(favoritedByQuestionId[question.id])}
                          pending={Boolean(favoritePendingByQuestionId[question.id])}
                          onClick={() => {
                            toggleFavorite(question);
                          }}
                        />
                      </div>
                      <p className="listening-exercise-feedback__line">
                        Richtige Antwort: {correctOption?.option_text || "-"}
                      </p>
                      <p className="listening-exercise-feedback__line">
                        Erklärung: {correctOption?.explanation || "Keine zusätzliche Erklärung."}
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="listening-exercise-actions">
            <ExamActionButton
              className="listening-exercise-check-btn"
              disabled={isChecked || !questions.length || answeredCount !== questions.length}
              onClick={() => {
                setIsChecked(true);
              }}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="listening-exercise-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setErrorText("");
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
