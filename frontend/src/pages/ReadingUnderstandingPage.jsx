import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchReadingUnderstandingExerciseDetail,
} from "../api/exam_preparation/readingUnderstanding.js";
import {
  fetchReadingUnderstandingQuestionStates,
  saveReadingUnderstandingQuestionState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import FormattedExplanation from "../components/examPreparation/FormattedExplanation.jsx";
import "./ReadingUnderstandingPage.css";

const FALLBACK_INSTRUCTION =
  "Lesen Sie den Text und die Aufgaben. Welche Lösung (a, b oder c) ist jeweils richtig?";

export default function ReadingUnderstandingPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByQuestionId, setFavoritedByQuestionId] = useState({});
  const [favoritePendingByQuestionId, setFavoritePendingByQuestionId] = useState({});

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        if (!exerciseId) {
          throw new Error("No reading understanding exercise selected.");
        }

        const detail = await fetchReadingUnderstandingExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchReadingUnderstandingQuestionStates(exerciseId);
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
          setErrorText(error?.message || "Failed to load exercise.");
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

  async function toggleFavorite(question) {
    const nextValue = !favoritedByQuestionId[question.id];
    setFavoritePendingByQuestionId((previous) => ({ ...previous, [question.id]: true }));
    try {
      const selectedOptionKey = answers[question.id] || "";
      const selectedOption = (question.answer_options || []).find(
        (option) => option.option_key === selectedOptionKey
      );
      await saveReadingUnderstandingQuestionState({
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
          return saveReadingUnderstandingQuestionState({
            question: question.id,
            is_favorited: Boolean(favoritedByQuestionId[question.id]),
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
    return (
      <div className="reading-understanding-page">
        <div className="reading-understanding-shell">
          <p className="reading-understanding-loading">Loading reading understanding exercise...</p>
        </div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="reading-understanding-page">
        <div className="reading-understanding-shell">
          <p className="reading-understanding-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reading-understanding-page">
      <div className="reading-understanding-shell">
        <div className="reading-understanding-topbar">
          <Link to="/modules/exam-preparation/lesen/understanding" className="reading-understanding-topbar__back">
            ← Zurück zu Lesen
          </Link>
          <span className="reading-understanding-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="reading-understanding-hero">
          <div className="reading-understanding-hero__main">
            <h1 className="reading-understanding-hero__title">{heroTitle}</h1>
          </div>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="reading-understanding-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="reading-understanding-hero__badge reading-understanding-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty ? (
                <span className="reading-understanding-hero__badge">
                  难度：{exercise.exercise_base.level || exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="reading-understanding-hero__badge reading-understanding-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="reading-understanding-instruction">
          <div className="reading-understanding-instruction__header">
            <span className="reading-understanding-instruction__label">Anleitung</span>
          </div>
          <p>{FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="reading-understanding-text">
          <div className="reading-understanding-text__header">
            <span className="reading-understanding-text__label">Lesetext</span>
          </div>
          <div className="reading-understanding-text__content">
            {String(exercise?.text_markdown || "")
              .split(/\n+/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </section>

        <section className="reading-understanding-questions">
          <div className="reading-understanding-question-list">
            {questions.map((question) => (
              <article key={question.id} className="reading-understanding-question-card">
                <div className="reading-understanding-question-card__header">
                  <h3>
                    {question.question_number}. {question.question_text}
                  </h3>
                </div>

                <div className="reading-understanding-option-grid">
                  {(question.answer_options || []).map((option) => {
                    const checked = answers[question.id] === option.option_key;
                    const isCorrect = !!option.is_correct;
                    const isWrongSelected = isChecked && checked && !isCorrect;
                    const shouldRevealCorrect = isChecked && isCorrect;

                    return (
                      <label
                        key={option.id}
                        className={[
                          "reading-understanding-option",
                          checked && !isChecked ? "reading-understanding-option--selected" : "",
                          shouldRevealCorrect ? "reading-understanding-option--correct" : "",
                          isWrongSelected ? "reading-understanding-option--wrong" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
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
                        <span className="reading-understanding-option__key">{option.option_key}</span>
                        <span className="reading-understanding-option__text">{option.option_text}</span>
                      </label>
                    );
                  })}
                </div>

                {isChecked ? (
                  <div
                    className={[
                      "reading-understanding-feedback",
                      (question.answer_options || []).some(
                        (option) => option.option_key === answers[question.id] && option.is_correct
                      )
                        ? "reading-understanding-feedback--correct"
                        : "reading-understanding-feedback--wrong",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                  <div className="reading-understanding-feedback__header">
                      <strong className="reading-understanding-feedback__title">
                        {(question.answer_options || []).some(
                          (option) => option.option_key === answers[question.id] && option.is_correct
                        )
                          ? "Richtig"
                          : "Falsch"}
                      </strong>
                      <ExerciseFavoriteButton
                        isFavorited={Boolean(favoritedByQuestionId[question.id])}
                        pending={Boolean(favoritePendingByQuestionId[question.id])}
                        onClick={() => {
                          toggleFavorite(question);
                        }}
                      />
                    </div>
                    <p className="reading-understanding-feedback__line">
                      Richtige Antwort:{" "}
                      {(question.answer_options || []).find((option) => option.is_correct)?.option_key} -{" "}
                      {(question.answer_options || []).find((option) => option.is_correct)?.option_text}
                    </p>
                    <p className="reading-understanding-feedback__line">
                      Erklärung: <FormattedExplanation
                        text={(question.answer_options || []).find((option) => option.is_correct)?.explanation}
                      />
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="reading-understanding-actions">
            <ExamActionButton
              className="reading-understanding-check-btn"
              disabled={isChecked || !questions.length || answeredCount !== questions.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="reading-understanding-reset-btn"
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
