import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchReadingAdMatchingExerciseDetail,
} from "../api/exam_preparation/readingAdMatching.js";
import {
  fetchReadingAdMatchingItemStates,
  saveReadingAdMatchingItemState,
} from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import FormattedExplanation from "../components/examPreparation/FormattedExplanation.jsx";
import "./ReadingAdMatchingPage.css";

const FALLBACK_INSTRUCTION =
  "Lesen sie die Situationen 1-10 und die Anzeigen a-l. Finden sie für jede die passende Anzeige. Sie können jede Anzeige nur einmal benutzen. Markieren sie Ihre Lösungen für die Aufgaben 1–10 auf dem Antwortbogen. Wenn Sie zu einer Situation keine Anzeige finden, markieren Sie x.";

function isNoMatchOption(ad) {
  return Boolean(ad?.is_no_match_option) || String(ad?.ad_key || "").trim().toLowerCase() === "x";
}

export default function ReadingAdMatchingPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [answers, setAnswers] = useState({});
  const [isChecked, setIsChecked] = useState(false);
  const [favoritedByItemId, setFavoritedByItemId] = useState({});
  const [favoritePendingByItemId, setFavoritePendingByItemId] = useState({});
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [activeAdPage, setActiveAdPage] = useState(0);
  const [adsPerPage, setAdsPerPage] = useState(4);

  useEffect(() => {
    let aborted = false;

    async function loadExercise() {
      try {
        setLoading(true);
        setErrorText("");

        if (!exerciseId) {
          throw new Error("No reading ad matching exercise selected.");
        }

        const detail = await fetchReadingAdMatchingExerciseDetail(exerciseId);
        if (!aborted) {
          setExercise(detail || null);
          const stateData = await fetchReadingAdMatchingItemStates(exerciseId);
          if (aborted) {
            return;
          }
          const nextAnswers = {};
          const nextFavorited = {};
          const stateResults = Array.isArray(stateData?.results) ? stateData.results : [];
          stateResults.forEach((stateItem) => {
            const itemId = stateItem?.item;
            const selectedAdKey = stateItem?.answer_payload?.selected_ad_key;
            if (itemId && selectedAdKey) {
              nextAnswers[itemId] = selectedAdKey;
            }
            if (itemId) {
              nextFavorited[itemId] = Boolean(stateItem?.is_favorited);
            }
          });
          setFavoritedByItemId(nextFavorited);
          const itemCount = Array.isArray(detail?.items) ? detail.items.length : 0;
          setAnswers(nextAnswers);
          setIsChecked(itemCount > 0 && Object.keys(nextAnswers).length === itemCount);
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

  const ads = useMemo(() => {
    return Array.isArray(exercise?.ads) ? exercise.ads : [];
  }, [exercise]);

  const items = useMemo(() => {
    return Array.isArray(exercise?.items) ? exercise.items : [];
  }, [exercise]);
  const heroTitle = useMemo(() => {
    return `Übung ${exercise?.exercise_base?.external_id || exercise?.id || exerciseId || ""}`.trim();
  }, [exercise, exerciseId]);

  const currentItem = items[activeItemIndex] || null;

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(Boolean).length;
  }, [answers]);

  const selectedAdKeys = useMemo(() => {
    return new Set(Object.values(answers).filter(Boolean));
  }, [answers]);

  useEffect(() => {
    function syncAdsPerPage() {
      if (window.innerWidth <= 700) {
        setAdsPerPage(1);
        return;
      }
      if (window.innerWidth <= 1100) {
        setAdsPerPage(2);
        return;
      }
      setAdsPerPage(4);
    }

    syncAdsPerPage();
    window.addEventListener("resize", syncAdsPerPage);
    return () => {
      window.removeEventListener("resize", syncAdsPerPage);
    };
  }, []);

  const adPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < ads.length; i += adsPerPage) {
      pages.push(ads.slice(i, i + adsPerPage));
    }
    return pages;
  }, [ads, adsPerPage]);

  useEffect(() => {
    setActiveAdPage((previous) => {
      const maxPage = Math.max(0, adPages.length - 1);
      return Math.min(previous, maxPage);
    });
  }, [adPages.length]);

  const visibleAds = useMemo(() => {
    return adPages[activeAdPage] || [];
  }, [adPages, activeAdPage]);

  function goToAdPage(index) {
    const maxPage = Math.max(0, adPages.length - 1);
    setActiveAdPage(Math.max(0, Math.min(index, maxPage)));
  }

  async function toggleFavorite(item) {
    const nextValue = !favoritedByItemId[item.id];
    setFavoritePendingByItemId((previous) => ({ ...previous, [item.id]: true }));
    try {
      await saveReadingAdMatchingItemState({
        item: item.id,
        is_favorited: nextValue,
        answer_payload: {
          selected_ad_key: answers[item.id] || "",
        },
        is_correct: answers[item.id] === item.correct_ad?.ad_key,
      });
      setFavoritedByItemId((previous) => ({ ...previous, [item.id]: nextValue }));
    } catch (error) {
      setErrorText(error?.message || "Favorit konnte nicht gespeichert werden.");
    } finally {
      setFavoritePendingByItemId((previous) => ({ ...previous, [item.id]: false }));
    }
  }

  async function handleCheck() {
    setIsChecked(true);

    try {
      await Promise.all(
        items.map((item) =>
          saveReadingAdMatchingItemState({
            item: item.id,
            is_favorited: Boolean(favoritedByItemId[item.id]),
            answer_payload: {
              selected_ad_key: answers[item.id] || "",
            },
            is_correct: answers[item.id] === item.correct_ad?.ad_key,
          })
        )
      );
    } catch (error) {
      setErrorText(error?.message || "Antworten konnten nicht gespeichert werden.");
    }
  }

  if (loading) {
    return (
      <div className="reading-ad-page">
        <div className="reading-ad-shell">
          <p className="reading-ad-loading">Loading reading ad matching exercise...</p>
        </div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="reading-ad-page">
        <div className="reading-ad-shell">
          <p className="reading-ad-error">{errorText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reading-ad-page">
      <div className="reading-ad-shell">
        <div className="reading-ad-topbar">
          <Link to="/modules/exam-preparation/lesen/ad-matching" className="reading-ad-topbar__back">
            ← Zurück zu Lesen
          </Link>
          <span className="reading-ad-topbar__meta">
            {exercise?.exercise_base?.level || "B1"} · {exercise?.exercise_base?.external_id || "001"}
          </span>
        </div>

        <section className="reading-ad-hero">
          <div className="reading-ad-hero__main">
            <h1 className="reading-ad-hero__title">{heroTitle}</h1>
          </div>
          {exercise?.exercise_base?.exam_type || exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty || exercise?.exercise_base?.is_real_exam ? (
            <div className="reading-ad-hero__badges">
              {exercise?.exercise_base?.exam_type ? <span className="reading-ad-hero__badge reading-ad-hero__badge--exam-type">{exercise.exercise_base.exam_type}</span> : null}
              {exercise?.exercise_base?.level || exercise?.exercise_base?.difficulty ? (
                <span className="reading-ad-hero__badge">
                  难度：{exercise.exercise_base.level || exercise.exercise_base.difficulty}
                </span>
              ) : null}
              {exercise?.exercise_base?.is_real_exam ? (
                <span className="reading-ad-hero__badge reading-ad-hero__badge--real">
                  真题
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="reading-ad-instruction">
          <div className="reading-ad-instruction__header">
            <span className="reading-ad-instruction__label">Anleitung</span>
          </div>
          <p>{exercise?.instruction || FALLBACK_INSTRUCTION}</p>
        </section>

        <section className="reading-ad-workspace">
          <div className="reading-ad-carousel-section__header">
            <h2>Anzeigen</h2>
            <span>Seite {activeAdPage + 1} / {Math.max(1, adPages.length)}</span>
          </div>
          <div className="reading-ad-sticky-stack">
            <div className="reading-ad-carousel" aria-label="Anzeigen">
              {visibleAds.map((ad) => {
                const lines = String(ad.ad_text_markdown || "")
                  .split("\n")
                  .filter(Boolean);
                const isSelected = !isNoMatchOption(ad) && selectedAdKeys.has(ad.ad_key);
                return (
                  <article
                    key={ad.id}
                    className={[
                      "reading-ad-card",
                      isSelected ? "reading-ad-card--selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {lines.map((line, index) => (
                      <p
                        key={index}
                        className={[
                          "reading-ad-card__line",
                          index === 0 ? "reading-ad-card__line--heading" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {line}
                      </p>
                    ))}
                  </article>
                );
              })}
            </div>

            <div className="reading-ad-carousel-controls">
              <button
                type="button"
                className="reading-ad-carousel-controls__arrow"
                onClick={() => {
                  goToAdPage(activeAdPage - 1);
                }}
                disabled={activeAdPage <= 0}
              >
                ‹
              </button>

              <div className="reading-ad-carousel-controls__dots">
                {adPages.map((pageAds, index) => (
                  <button
                    key={pageAds.map((item) => item.id).join("-")}
                    type="button"
                    className={[
                      "reading-ad-carousel-controls__dot",
                      index === activeAdPage ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={`Anzeige page ${index + 1}`}
                    onClick={() => {
                      goToAdPage(index);
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                className="reading-ad-carousel-controls__arrow"
                onClick={() => {
                  goToAdPage(activeAdPage + 1);
                }}
                disabled={activeAdPage >= adPages.length - 1}
              >
                ›
              </button>
            </div>
          </div>

          <section className="reading-ad-question-section">
          <div className="reading-ad-pagination">
            <button
              type="button"
              className="reading-ad-pagination__nav"
              onClick={() => {
                setActiveItemIndex(0);
              }}
              disabled={activeItemIndex <= 0}
            >
              «
            </button>

            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={[
                  "reading-ad-pagination__item",
                  answers[item.id] && !isChecked ? "is-answered" : "",
                  index === activeItemIndex ? "is-active" : "",
                  isChecked && answers[item.id] === item.correct_ad?.ad_key ? "is-correct" : "",
                  isChecked &&
                  answers[item.id] &&
                  answers[item.id] !== item.correct_ad?.ad_key
                    ? "is-wrong"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  setActiveItemIndex(index);
                }}
              >
                {item.item_number}
              </button>
            ))}

            <button
              type="button"
              className="reading-ad-pagination__nav"
              onClick={() => {
                setActiveItemIndex(items.length - 1);
              }}
              disabled={activeItemIndex >= items.length - 1}
            >
              »
            </button>
          </div>

          {currentItem ? (
            <article className="reading-ad-question-card">
              <div className="reading-ad-question-card__meta">
                <span className="reading-ad-question-card__label">Situation</span>
                <span className="reading-ad-question-card__progress">
                  {activeItemIndex + 1} / {items.length}
                </span>
              </div>
              <h3 className="reading-ad-question-card__title">
                <span className="reading-ad-question-card__number">{currentItem.item_number}.</span>{" "}
                {currentItem.item_text}
              </h3>

              <div className="reading-ad-option-grid">
                {ads.map((ad) => {
                  const checked = answers[currentItem.id] === ad.ad_key;
                  const isUsed = !isNoMatchOption(ad) && selectedAdKeys.has(ad.ad_key);
                  const isCorrect = ad.ad_key === currentItem.correct_ad?.ad_key;
                  const isWrongSelected = isChecked && checked && !isCorrect;
                  const shouldRevealCorrect = isChecked && isCorrect;

                  return (
                    <label
                      key={ad.id}
                      className={[
                        "reading-ad-option",
                        isUsed ? "reading-ad-option--used" : "",
                        checked && !isChecked ? "reading-ad-option--selected" : "",
                        shouldRevealCorrect ? "reading-ad-option--correct" : "",
                        isWrongSelected ? "reading-ad-option--wrong" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <input
                        type="radio"
                        name={`item-${currentItem.id}`}
                        value={ad.ad_key}
                        checked={checked}
                        onChange={() => {
                          if (isChecked) {
                            setIsChecked(false);
                          }
                          setAnswers((previous) => ({
                            ...previous,
                            [currentItem.id]: ad.ad_key,
                          }));
                        }}
                      />
                      <span className="reading-ad-option__circle" />
                      <span className="reading-ad-option__key">
                        {String(ad.ad_key || "").toLocaleUpperCase()}
                      </span>
                    </label>
                  );
                })}
              </div>

              {isChecked ? (
                <div
                  className={[
                    "reading-ad-feedback",
                    answers[currentItem.id] === currentItem.correct_ad?.ad_key
                      ? "reading-ad-feedback--correct"
                      : "reading-ad-feedback--wrong",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="reading-ad-feedback__header">
                    <strong className="reading-ad-feedback__title">
                      {answers[currentItem.id] === currentItem.correct_ad?.ad_key
                        ? "Richtig"
                        : "Falsch"}
                    </strong>
                    <ExerciseFavoriteButton
                      isFavorited={Boolean(favoritedByItemId[currentItem.id])}
                      pending={Boolean(favoritePendingByItemId[currentItem.id])}
                      onClick={() => {
                        toggleFavorite(currentItem);
                      }}
                    />
                  </div>
                  <p className="reading-ad-feedback__line">
                    Richtige Antwort:{" "}
                    {String(currentItem.correct_ad?.ad_key || "").toLocaleUpperCase()}
                  </p>
                  <p className="reading-ad-feedback__line">
                    Erklärung: <FormattedExplanation text={currentItem.explanation} />
                  </p>
                </div>
              ) : null}
            </article>
          ) : null}

          <div className="reading-ad-actions">
            <ExamActionButton
              className="reading-ad-check-btn"
              disabled={isChecked || !items.length || answeredCount !== items.length}
              onClick={handleCheck}
              label="Prüfen"
              icon="check"
            />
            {isChecked ? (
              <ExamActionButton
                className="reading-ad-reset-btn"
                onClick={() => {
                  setAnswers({});
                  setIsChecked(false);
                  setActiveItemIndex(0);
                  setActiveAdPage(0);
                }}
                label="Wiederholen"
                icon="rotate"
              />
            ) : null}
          </div>
          </section>
        </section>
      </div>
    </div>
  );
}
