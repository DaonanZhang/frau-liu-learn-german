import { useEffect, useMemo, useState } from "react";

import ExerciseFavoriteButton from "./ExerciseFavoriteButton.jsx";
import FormattedExplanation from "./FormattedExplanation.jsx";

function isNoMatchOption(ad) {
  return Boolean(ad?.is_no_match_option) || String(ad?.ad_key || "").trim().toLowerCase() === "x";
}

/**
 * Render the shared reading-ad carousel and question workspace.
 */
export default function ReadingAdMatchingWorkspace({
  exercise,
  answers,
  onAnswer,
  review = false,
  favoriteFor,
}) {
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [activeAdPage, setActiveAdPage] = useState(0);
  const [adsPerPage, setAdsPerPage] = useState(4);
  const ads = useMemo(() => Array.isArray(exercise?.ads) ? exercise.ads : [], [exercise]);
  const items = useMemo(() => Array.isArray(exercise?.items) ? exercise.items : [], [exercise]);
  const displayAds = useMemo(() => ads.filter((ad) => !isNoMatchOption(ad)), [ads]);
  const selectedAdKeys = useMemo(() => new Set(Object.values(answers).filter(Boolean)), [answers]);
  const currentItem = items[activeItemIndex] || null;

  useEffect(() => {
    function syncAdsPerPage() {
      if (window.innerWidth <= 700) setAdsPerPage(1);
      else if (window.innerWidth <= 1100) setAdsPerPage(2);
      else setAdsPerPage(4);
    }
    syncAdsPerPage();
    window.addEventListener("resize", syncAdsPerPage);
    return () => window.removeEventListener("resize", syncAdsPerPage);
  }, []);

  const adPages = useMemo(() => {
    const pages = [];
    for (let index = 0; index < displayAds.length; index += adsPerPage) {
      pages.push(displayAds.slice(index, index + adsPerPage));
    }
    return pages;
  }, [displayAds, adsPerPage]);

  const safeActiveAdPage = Math.min(activeAdPage, Math.max(0, adPages.length - 1));
  const visibleAds = adPages[safeActiveAdPage] || [];
  const goToAdPage = (index) => setActiveAdPage(Math.max(0, Math.min(index, Math.max(0, adPages.length - 1))));

  return (
    <section className="reading-ad-workspace">
      <div className="reading-ad-carousel-section__header">
        <h2>Anzeigen</h2>
        <span>Seite {safeActiveAdPage + 1} / {Math.max(1, adPages.length)}</span>
      </div>
      <div className="reading-ad-sticky-stack">
        <div className="reading-ad-carousel" aria-label="Anzeigen">
          {visibleAds.map((ad) => {
            const lines = String(ad.ad_text_markdown || "").split("\n").filter(Boolean);
            const isSelected = selectedAdKeys.has(ad.ad_key);
            return (
              <article
                key={ad.id}
                aria-label={`Anzeige ${String(ad.ad_key || "").toLocaleUpperCase()}`}
                className={`reading-ad-card${isSelected ? " reading-ad-card--selected" : ""}`}
              >
                <span className="reading-ad-card__number">Anzeige {String(ad.ad_key || "").toLocaleUpperCase()}</span>
                {lines.map((line, index) => (
                  <p key={index} className={`reading-ad-card__line${index === 0 ? " reading-ad-card__line--heading" : ""}`}>
                    {line}
                  </p>
                ))}
              </article>
            );
          })}
        </div>
        <div className="reading-ad-carousel-controls">
          <button type="button" className="reading-ad-carousel-controls__arrow" onClick={() => goToAdPage(safeActiveAdPage - 1)} disabled={safeActiveAdPage <= 0}>‹</button>
          <div className="reading-ad-carousel-controls__dots">
            {adPages.map((pageAds, index) => (
              <button
                key={pageAds.map((item) => item.id).join("-")}
                type="button"
                className={`reading-ad-carousel-controls__dot${index === safeActiveAdPage ? " is-active" : ""}`}
                aria-label={`Anzeige page ${index + 1}`}
                onClick={() => goToAdPage(index)}
              />
            ))}
          </div>
          <button type="button" className="reading-ad-carousel-controls__arrow" onClick={() => goToAdPage(safeActiveAdPage + 1)} disabled={safeActiveAdPage >= adPages.length - 1}>›</button>
        </div>
      </div>

      <section className="reading-ad-question-section">
        <div className="reading-ad-pagination">
          <button type="button" className="reading-ad-pagination__nav" onClick={() => setActiveItemIndex(0)} disabled={activeItemIndex <= 0}>«</button>
          {items.map((item, index) => {
            const selected = answers[item.id] || "";
            return (
              <button
                key={item.id}
                type="button"
                className={[
                  "reading-ad-pagination__item",
                  selected && !review ? "is-answered" : "",
                  index === activeItemIndex ? "is-active" : "",
                  review && selected === item.correct_ad?.ad_key ? "is-correct" : "",
                  review && selected && selected !== item.correct_ad?.ad_key ? "is-wrong" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => setActiveItemIndex(index)}
              >
                {item.item_number}
              </button>
            );
          })}
          <button type="button" className="reading-ad-pagination__nav" onClick={() => setActiveItemIndex(items.length - 1)} disabled={activeItemIndex >= items.length - 1}>»</button>
        </div>

        {currentItem ? (
          <article className="reading-ad-question-card">
            <div className="reading-ad-question-card__meta">
              <span className="reading-ad-question-card__label">Situation</span>
              <span className="reading-ad-question-card__progress">{activeItemIndex + 1} / {items.length}</span>
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
                const optionId = `reading-ad-${currentItem.id}-${ad.id}`;
                return (
                  <label
                    key={ad.id}
                    htmlFor={optionId}
                    className={[
                      "reading-ad-option",
                      isUsed ? "reading-ad-option--used" : "",
                      checked && !review ? "reading-ad-option--selected" : "",
                      review && isCorrect ? "reading-ad-option--correct" : "",
                      review && checked && !isCorrect ? "reading-ad-option--wrong" : "",
                      review ? "reading-ad-option--locked" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <input
                      id={optionId}
                      type="radio"
                      name={`item-${currentItem.id}`}
                      value={ad.ad_key}
                      checked={checked}
                      disabled={review}
                      onChange={() => onAnswer(currentItem.id, ad.ad_key)}
                    />
                    <span className="reading-ad-option__circle" />
                    <span className="reading-ad-option__key">{String(ad.ad_key || "").toLocaleUpperCase()}</span>
                  </label>
                );
              })}
            </div>
            {review ? (
              <div className={`reading-ad-feedback reading-ad-feedback--${answers[currentItem.id] === currentItem.correct_ad?.ad_key ? "correct" : "wrong"}`}>
                <div className="reading-ad-feedback__header">
                  <strong className="reading-ad-feedback__title">{answers[currentItem.id] === currentItem.correct_ad?.ad_key ? "Richtig" : answers[currentItem.id] ? "Falsch" : "未作答"}</strong>
                  {favoriteFor ? <ExerciseFavoriteButton {...favoriteFor(currentItem)} /> : null}
                </div>
                <p className="reading-ad-feedback__line">Richtige Antwort: {String(currentItem.correct_ad?.ad_key || "").toLocaleUpperCase()}</p>
                {String(currentItem.explanation || "").trim() ? (
                  <p className="reading-ad-feedback__line">Erklärung: <FormattedExplanation text={currentItem.explanation} /></p>
                ) : null}
              </div>
            ) : null}
          </article>
        ) : null}
      </section>
    </section>
  );
}
