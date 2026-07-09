import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ExerciseSelectionPage.css";

export default function ExerciseSelectionPage({
  backTo,
  backLabel,
  eyebrow,
  title,
  description,
  tags = [],
  fetchExercises,
  buildExerciseHref,
  cardLabel = "Übung",
  cardDescription = "Öffne diese Aufgabe und beginne direkt mit dem Training.",
  cardCta = "Übung öffnen",
  emptyMessage = "Zurzeit sind keine Aufgaben verfügbar.",
}) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let aborted = false;

    async function loadExercises() {
      try {
        setLoading(true);
        setErrorText("");
        const data = await fetchExercises();
        if (!aborted) {
          setExercises(Array.isArray(data?.results) ? data.results : []);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "Aufgaben konnten nicht geladen werden.");
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    }

    loadExercises();
    return () => {
      aborted = true;
    };
  }, [fetchExercises]);

  return (
    <div className="exercise-selection-page">
      <div className="exercise-selection-topbar">
        <Link to={backTo} className="exercise-selection-topbar__back">
          {backLabel}
        </Link>
      </div>

      <section className="exercise-selection-hero">
        <div>
          <p className="exercise-selection-hero__eyebrow">{eyebrow}</p>
          <h1 className="exercise-selection-hero__title">{title}</h1>
          <p className="exercise-selection-hero__copy">{description}</p>
          {tags.length ? (
            <div className="exercise-selection-hero__tags">
              {tags.map((tag) => (
                <span key={tag} className="exercise-selection-hero__tag">{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {loading ? <p className="exercise-selection-state">Aufgaben werden geladen...</p> : null}
      {errorText ? <p className="exercise-selection-state exercise-selection-state--error">{errorText}</p> : null}

      {!loading && !errorText && exercises.length > 0 ? (
        <section className="exercise-selection-grid" aria-label="Aufgabenliste">
          {exercises.map((exercise, index) => {
            const cardTitle =
              exercise?.exercise_base?.title?.trim() || `Übung ${index + 1}`;
            const isRealExam = Boolean(exercise?.exercise_base?.is_real_exam);

            return (
              <Link
                key={exercise.id || index}
                to={buildExerciseHref(exercise)}
                className="exercise-selection-card"
              >
                <div className="exercise-selection-card__top">
                  <div className="exercise-selection-card__meta">
                    <div className="exercise-selection-card__meta-left">
                      <span className="exercise-selection-card__chip">{cardLabel}</span>
                      {isRealExam ? (
                        <span className="exercise-selection-card__badge exercise-selection-card__badge--real">
                          真题
                        </span>
                      ) : null}
                    </div>
                    <span className="exercise-selection-card__index">#{index + 1}</span>
                  </div>
                  <h2 className="exercise-selection-card__title">{cardTitle}</h2>
                </div>
                <p className="exercise-selection-card__description">{cardDescription}</p>
                <div className="exercise-selection-card__bottom">
                  <span className="exercise-selection-card__cta">{cardCta}</span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}

      {!loading && !errorText && exercises.length === 0 ? (
        <p className="exercise-selection-state">{emptyMessage}</p>
      ) : null}
    </div>
  );
}
