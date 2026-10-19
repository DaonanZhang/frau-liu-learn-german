import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import {
  fetchListeningExerciseDetail,
} from "../api/exam_preparation/listeningExercises.js";
import {
  fetchListeningQuestionStates,
  saveListeningQuestionState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import {
  AnnotatableTextRegion,
  ExamTextAnnotationProvider,
  useExamTextAnnotations,
} from "../components/examPreparation/ExamTextAnnotations.jsx";
import ListeningTranscript from "../components/examPreparation/ListeningTranscript.jsx";
import ScopedExplanation from "../components/examPreparation/ScopedExplanation.jsx";
import { hasScopedExplanation } from "../components/examPreparation/explanationVisibility.js";
import { exerciseAnnotationScope } from "../utils/examTextAnnotations.js";
import useReliableAudioSources, { AUDIO_LOAD_ERROR } from "../hooks/useReliableAudioSources.js";
import "./ListeningExercisePage.css";

const INSTRUCTION_BY_TYPE = {
  short_text_true_false_with_prep:
    "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1 - 5 richtig oder falsch sind. Lesen Sie jetzt die Aufgaben 1 - 5. Sie haben dazu 30 Sekunden Zeit.",
  short_text_true_false_once:
    "Sie hören nun ein Gespräch. Dazu sollen Sie 10 Aufgaben lösen. Sie hören das Gespräch zweimal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
  dialog_true_false_twice:
    "Sie hören nun fünf kurze Texte. Dazu sollen Sie fünf Aufgaben lösen. Sie hören diese Texte nur einmal. Entscheiden Sie beim Hören, ob die Aussagen richtig oder falsch sind.",
};

const TELC_B2_TEIL1_INSTRUCTION = "Sie hören nun eine Nachrichtensendung. Dazu sollen Sie fünf Aufgaben lösen. Sie hören die Nachrichtensendung nur einmal. Entscheiden Sie beim Hören, ob die Aussagen 1–5 richtig oder falsch sind. Markieren Sie Ihre Lösungen auf dem Antwortbogen bei den Aufgaben 1–5. Markieren Sie PLUS (+) gleich richtig und MINUS (–) gleich falsch auf dem Antwortbogen. Lesen Sie jetzt die Aufgaben 1–5. Sie haben dazu 30 Sekunden Zeit.";

const EYEBROW_BY_TYPE = {
  short_text_true_false_with_prep: "Hören · Teil 1",
  short_text_true_false_once: "Hören · Teil 2",
  dialog_true_false_twice: "Hören · Teil 3",
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function formatAudioTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function ListeningResetButton({ onReset }) {
  const { clearAnnotations } = useExamTextAnnotations();

  return (
    <ExamActionButton
      className="listening-exercise-reset-btn"
      onClick={() => {
        clearAnnotations();
        onReset();
      }}
      label="Wiederholen"
      icon="rotate"
    />
  );
}

export default function ListeningExercisePage({
  listeningType,
  backTo = "/modules/exam-preparation/hoeren",
}) {
  const { exerciseId } = useParams();
  const scope = examPreparationScope(useParams().level);
  const audioRef = useRef(null);
  const teil2CompletedPlaysRef = useRef(0);
  const streamRetriedRef = useRef(false);
  const recoveryPositionRef = useRef(0);
  const playIntentRef = useRef(false);
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByQuestionId, setFavoritedByQuestionId] = useState({});
  const [favoritePendingByQuestionId, setFavoritePendingByQuestionId] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const isTeil2 = listeningType === "short_text_true_false_once";
  const audioUrls = useMemo(() => [exercise?.audio_file_url].filter(Boolean), [exercise?.audio_file_url]);
  const { sources: audioSources, statuses: audioStatuses } = useReliableAudioSources(audioUrls);
  const audioUrl = exercise?.audio_file_url || "";
  const backupAudioSource = audioSources[audioUrl] || "";
  const backupAudioStatus = audioUrl ? (audioStatuses[audioUrl] || "loading") : "error";
  const [audioMode, setAudioMode] = useState("stream");
  const [audioRecoveryState, setAudioRecoveryState] = useState("idle");
  const audioSource = audioMode === "blob" ? backupAudioSource : audioUrl;
  const audioFailed = audioRecoveryState === "error"
    || (audioRecoveryState === "switching" && backupAudioStatus === "error");
  const audioLoading = audioRecoveryState === "recovering"
    || (audioRecoveryState === "switching" && backupAudioStatus === "loading");

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        if (!exerciseId) {
          throw new Error("No listening exercise selected.");
        }

        const detail = await fetchListeningExerciseDetail(exerciseId, scope);
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
          const questionCount = Array.isArray(detail?.questions) ? detail.questions.length : 0;
          setAnswers(nextAnswers);
          setIsChecked(questionCount > 0 && Object.keys(nextAnswers).length === questionCount);
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

    audioElement.playbackRate = playbackRate;
    audioElement.loop = !isTeil2 && repeatEnabled;
    return undefined;
  }, [audioSource, isTeil2, playbackRate, repeatEnabled]);

  useEffect(() => {
    streamRetriedRef.current = false;
    recoveryPositionRef.current = 0;
    playIntentRef.current = false;
    setAudioMode("stream");
    setAudioRecoveryState("idle");
    resetAudioProgress();
  }, [audioUrl]);

  useEffect(() => {
    if (audioRecoveryState === "switching" && backupAudioStatus === "ready") {
      setAudioMode("blob");
    }
  }, [audioRecoveryState, backupAudioStatus]);

  function syncAudioProgress(audioElement) {
    setCurrentTime(Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0);
    setDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0);
  }

  function resetAudioProgress() {
    teil2CompletedPlaysRef.current = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }

  const questions = useMemo(() => {
    return Array.isArray(exercise?.questions) ? exercise.questions : [];
  }, [exercise]);
  const instruction = scope?.examType === "TELC"
    && scope.level === "B2"
    && listeningType === "short_text_true_false_with_prep"
    ? TELC_B2_TEIL1_INSTRUCTION
    : INSTRUCTION_BY_TYPE[listeningType] || INSTRUCTION_BY_TYPE.short_text_true_false_once;
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
      playIntentRef.current = true;
      try {
        await audioElement.play();
      } catch (error) {
        await recoverAudioPlayback(error);
      }
      return;
    }

    playIntentRef.current = false;
    audioElement.pause();
  }

  async function recoverAudioPlayback(error, shouldPlay = true) {
    const audioElement = audioRef.current;
    if (!audioElement || error?.name === "NotAllowedError") {
      setErrorText(error?.message || "Audio playback failed.");
      return;
    }
    recoveryPositionRef.current = Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0;
    setIsPlaying(false);
    if (audioMode === "stream" && !streamRetriedRef.current) {
      streamRetriedRef.current = true;
      setAudioRecoveryState("recovering");
      audioElement.load();
      try { audioElement.currentTime = recoveryPositionRef.current; } catch { /* restore after media is ready */ }
      if (!shouldPlay) {
        setAudioRecoveryState("idle");
        return;
      }
      try {
        await audioElement.play();
        setAudioRecoveryState("idle");
        return;
      } catch (retryError) {
        if (retryError?.name === "NotAllowedError") {
          setAudioRecoveryState("idle");
          setErrorText(retryError.message || "Audio playback failed.");
          return;
        }
      }
    }
    if (audioMode === "blob") {
      setAudioRecoveryState("error");
      return;
    }
    setAudioRecoveryState(backupAudioStatus === "error" ? "error" : "switching");
    if (backupAudioStatus === "ready") setAudioMode("blob");
  }

  async function resumeBackupPlayback(event) {
    if (audioMode !== "blob" || audioRecoveryState !== "switching") return;
    event.currentTarget.currentTime = recoveryPositionRef.current;
    try {
      await event.currentTarget.play();
      setAudioRecoveryState("idle");
    } catch (error) {
      await recoverAudioPlayback(error);
    }
  }

  function restartAudio() {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }
    teil2CompletedPlaysRef.current = 0;
    playIntentRef.current = true;
    audioElement.currentTime = 0;
    setCurrentTime(0);
    audioElement.play().catch((error) => {
      recoverAudioPlayback(error);
    });
  }

  async function handleAudioEnded(event) {
    const audioElement = event.currentTarget;
    if (isTeil2 && teil2CompletedPlaysRef.current === 0) {
      teil2CompletedPlaysRef.current = 1;
      audioElement.currentTime = 0;
      setCurrentTime(0);
      try {
        await audioElement.play();
      } catch (error) {
        await recoverAudioPlayback(error);
      }
      return;
    }

    teil2CompletedPlaysRef.current = 0;
    playIntentRef.current = false;
    setIsPlaying(false);
    syncAudioProgress(audioElement);
  }

  function seekAudio(event) {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    const nextTime = Number(event.target.value);
    audioElement.currentTime = nextTime;
    setCurrentTime(nextTime);
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

  async function handleCheck() {
    setIsChecked(true);

    try {
      await Promise.all(
        questions.map((question) => {
          const selectedOptionKey = answers[question.id] || "";
          const selectedOption = (question.answer_options || []).find(
            (option) => option.option_key === selectedOptionKey
          );
          return saveListeningQuestionState({
            question: question.id,
            is_favorited: Boolean(favoritedByQuestionId[question.id]),
            answer_payload: {
              selected_option_key: selectedOptionKey,
            },
            is_correct: selectedOption ? Boolean(selectedOption.is_correct) : false,
          });
        })
      );
      const completedExercise = await fetchListeningExerciseDetail(exerciseId, scope);
      setExercise(completedExercise || exercise);
    } catch (error) {
      setErrorText(error?.message || "Antworten konnten nicht gespeichert werden.");
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
    <ExamTextAnnotationProvider
      scope={exerciseAnnotationScope(exercise.exercise_base.exercise_type, exercise.id)}
    >
      <div className="listening-exercise-page">
      <div className="listening-exercise-shell">
        <div className="listening-exercise-topbar">
          <Link to={typeof backTo === "function" ? backTo(scope) : backTo} className="listening-exercise-topbar__back">
            ← Zurück zu Hören
          </Link>
          <span className="listening-exercise-topbar__meta">
            {exercise?.exercise_base?.level || scope?.level} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="listening-exercise-hero">
          <div className="listening-exercise-hero__main">
            <p className="listening-exercise-audio-panel__eyebrow">
              {EYEBROW_BY_TYPE[listeningType] || "Hören"}
            </p>
            <h1 className="listening-exercise-hero__title">{heroTitle}</h1>
          </div>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || scope?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="listening-exercise-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="listening-exercise-hero__badge listening-exercise-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || scope?.level || exercise?.exercise_base?.difficulty ? (
                <span className="listening-exercise-hero__badge">
                  难度：{exercise.exercise_base.level || scope?.level || exercise.exercise_base.difficulty}
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
          <AnnotatableTextRegion regionId="task" as="p">
            {instruction}
          </AnnotatableTextRegion>
        </section>

        <section className="listening-exercise-audio-panel">
          <div className="listening-exercise-audio-panel__header">
            <div>
              <p className="listening-exercise-audio-panel__eyebrow">Audio</p>
              <h2 className="listening-exercise-audio-panel__title">Hören und steuern</h2>
            </div>
            <span className="listening-exercise-audio-panel__status">
              {audioLoading ? "Wird geladen" : isPlaying ? "Wird abgespielt" : audioFailed ? "Fehler" : "Bereit"}
            </span>
          </div>

          <div className="listening-exercise-audio-player">
            <audio
              key={audioSource || "no-audio"}
              ref={audioRef}
              src={audioSource || undefined}
              preload="metadata"
              onLoadedMetadata={(event) => {
                syncAudioProgress(event.currentTarget);
              }}
              onCanPlay={resumeBackupPlayback}
              onDurationChange={(event) => {
                syncAudioProgress(event.currentTarget);
              }}
              onTimeUpdate={(event) => {
                syncAudioProgress(event.currentTarget);
              }}
              onSeeked={(event) => {
                syncAudioProgress(event.currentTarget);
              }}
              onPlay={() => {
                setIsPlaying(true);
              }}
              onPause={() => {
                setIsPlaying(false);
              }}
              onEnded={handleAudioEnded}
              onError={(event) => { recoverAudioPlayback(event.currentTarget.error, playIntentRef.current); }}
              onContextMenu={(event) => {
                event.preventDefault();
              }}
              onDragStart={(event) => {
                event.preventDefault();
              }}
            />
            <button
              type="button"
              className="listening-exercise-timeline__play"
              onClick={togglePlayback}
              aria-label={isPlaying ? "Audio pausieren" : "Audio abspielen"}
              title={isPlaying ? "Pause" : "Abspielen"}
              disabled={!audioSource || audioLoading || audioFailed}
            >
              <span
                className={isPlaying ? "" : "listening-exercise-timeline__play-icon"}
                aria-hidden="true"
              >
                {isPlaying ? "Ⅱ" : "▶"}
              </span>
            </button>
            <label className="listening-exercise-timeline" htmlFor="listening-audio-position">
              <span className="listening-exercise-timeline__meta">
                <span>Wiedergabeposition</span>
                <span>{formatAudioTime(currentTime)} / {formatAudioTime(duration)}</span>
              </span>
              <input
                id="listening-audio-position"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                disabled={!duration}
                onChange={seekAudio}
                aria-label="Wiedergabeposition"
                style={{
                  "--listening-audio-progress": `${Math.min(100, duration ? (currentTime / duration) * 100 : 0)}%`,
                }}
              />
            </label>
            {audioLoading ? (
              <div className="listening-exercise-audio-message is-loading" role="status">
                <span className="listening-exercise-audio-spinner" aria-hidden="true" />
                {audioRecoveryState === "switching" ? "正在切换备用音频…" : "正在恢复音频播放…"}
              </div>
            ) : null}
            {audioFailed ? (
              <div className="listening-exercise-audio-message is-error" role="alert">{AUDIO_LOAD_ERROR}</div>
            ) : null}
          </div>

          <div className="listening-exercise-controls" aria-label="Audiosteuerung">
            <button
              type="button"
              className="listening-exercise-control-btn listening-exercise-control-btn--secondary"
              onClick={restartAudio}
              disabled={!audioSource || audioLoading || audioFailed}
            >
              Wieder abspielen
            </button>
            <label className="listening-exercise-select" htmlFor="listening-playback-rate">
              <span className="listening-exercise-control-label">Geschwindigkeit</span>
              <select
                id="listening-playback-rate"
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
            {!isTeil2 ? (
              <label className="listening-exercise-repeat" htmlFor="listening-repeat">
                <input
                  id="listening-repeat"
                  type="checkbox"
                  checked={repeatEnabled}
                  onChange={(event) => {
                    setRepeatEnabled(event.target.checked);
                  }}
                />
                <span>Repeat aktivieren</span>
              </label>
            ) : null}
          </div>
        </section>

        {isChecked ? (
          <ListeningTranscript
            script={exercise?.script}
            annotationRegionPrefix="transcript"
            annotationsEnabled
          />
        ) : null}

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
                      <AnnotatableTextRegion regionId={`question:${question.id}`} as="h3">
                        {question.question_text}
                      </AnnotatableTextRegion>
                    </div>
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
                          <AnnotatableTextRegion
                            regionId={`option:${question.id}:${option.id ?? option.option_key}`}
                            className="listening-exercise-option__key"
                          >
                            {option.option_text}
                          </AnnotatableTextRegion>
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
                      {hasScopedExplanation(question.explanation, question.answer_options || []) ? (
                        <p className="listening-exercise-feedback__line">
                          Erklärung:{" "}
                          <AnnotatableTextRegion regionId={`explanation:${question.id}`}>
                            <ScopedExplanation
                              explanation={question.explanation}
                              explanationScope={question.explanation_scope}
                              options={question.answer_options || []}
                            />
                          </AnnotatableTextRegion>
                        </p>
                      ) : null}
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
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ListeningResetButton
                onReset={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setErrorText("");
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
