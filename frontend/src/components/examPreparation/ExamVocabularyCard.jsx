import { useEffect, useState } from "react";
import { setVocabularyCardFavorite } from "../../api/exam_preparation/vocabularyCards.js";
import ExerciseFavoriteButton from "./ExerciseFavoriteButton.jsx";
import "./ExamVocabularyCard.css";

function present(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    const parts = Object.values(value).filter((part) => part != null && part !== "");
    return parts.length ? parts.join(" · ") : null;
  }
  return String(value);
}

function presentVerbForms(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return present(value);
  return Object.entries(value)
    .map(([label, form]) => {
      const text = present(form);
      return text ? `${label}: ${text}` : null;
    })
    .filter(Boolean)
    .join(" · ") || null;
}

export default function ExamVocabularyCard({ entry, onFavoriteChange }) {
  const card = entry?.card;
  const term = card?.term || entry?.word || entry?.term || entry?.de;
  const translation = card?.translation_zh || entry?.translation_zh || entry?.translation || entry?.zh;
  const [favorite, setFavorite] = useState(Boolean(card?.is_favorite));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const toggleFavorite = async () => {
    if (!card?.id || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await setVocabularyCardFavorite(card.id, !favorite);
      const next = typeof result?.is_favorite === "boolean" ? result.is_favorite : !favorite;
      setFavorite(next);
      onFavoriteChange?.(card.id, next);
    } catch {
      setError("收藏更新失败，请重试。");
    } finally {
      setPending(false);
    }
  };
  useEffect(() => setFavorite(Boolean(card?.is_favorite)), [card?.id, card?.is_favorite]);
  const forms = presentVerbForms(card?.verb_forms);
  return (
    <article className="exam-vocabulary-card">
      <header className="exam-vocabulary-card__header">
        <div><h2>{term}</h2>{translation ? <p className="exam-vocabulary-card__translation">{translation}</p> : null}</div>
        {card?.id ? <ExerciseFavoriteButton isFavorited={favorite} pending={pending} onClick={toggleFavorite} label={`收藏 ${term}`} /> : null}
      </header>
      {error ? <p className="exam-vocabulary-card__error" role="alert">{error}</p> : null}
      {card ? <dl className="exam-vocabulary-card__details">
        {present(card.part_of_speech) ? <div><dt>词性</dt><dd>{present(card.part_of_speech)}</dd></div> : null}
        {[card.article, card.plural].some((value) => present(value)) ? <div><dt>冠词 · 复数</dt><dd>{[present(card.article), present(card.plural)].filter(Boolean).join(" · ")}</dd></div> : null}
        {forms ? <div><dt>动词变位</dt><dd>{forms}</dd></div> : null}
        {present(card.note) ? <div><dt>备注</dt><dd>{present(card.note)}</dd></div> : null}
        {present(card.example_de) ? <div><dt>例句</dt><dd>{present(card.example_de)}</dd></div> : null}
        {present(card.example_zh) ? <div><dt>译文</dt><dd>{present(card.example_zh)}</dd></div> : null}
      </dl> : null}
    </article>
  );
}
