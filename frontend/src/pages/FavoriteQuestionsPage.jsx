import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchFavoriteQuestions,
  removeFavoriteQuestion,
} from "../api/exam_preparation/favoriteQuestions.js";
import "./FavoriteQuestionsPage.css";

const SKILL_FILTERS = [
  { key: "ALL", label: "全部" },
  { key: "LISTENING", label: "听力" },
  { key: "READING", label: "阅读" },
  { key: "SPRACHBAUSTEIN", label: "语言构件" },
  { key: "WRITING", label: "写作" },
  { key: "SPEAKING", label: "口语" },
];

const SKILL_META = {
  LISTENING: { label: "Hören", className: "is-listening" },
  READING: { label: "Lesen", className: "is-reading" },
  SPRACHBAUSTEIN: { label: "Sprachbausteine", className: "is-cloze" },
  WRITING: { label: "Schreiben", className: "is-writing" },
  SPEAKING: { label: "Sprechen", className: "is-speaking" },
};

function normalizePreview(value) {
  return String(value || "")
    .replace(/[#*`>~]/g, "")
    .replace(/\[[^\]]+\]/g, "___")
    .replace(/\s+/g, " ")
    .trim();
}

function renderQuestionPreview(preview) {
  return preview.split(/(【第 \d+ 空】)/g).map((part, index) => {
    if (/^【第 \d+ 空】$/.test(part)) {
      return <mark key={`${part}-${index}`} className="favorite-question-card__blank">{part}</mark>;
    }
    return part;
  });
}

export default function FavoriteQuestionsPage() {
  const [questions, setQuestions] = useState([]);
  const [activeSkill, setActiveSkill] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let aborted = false;

    async function loadFavorites() {
      setLoading(true);
      setErrorText("");
      try {
        const data = await fetchFavoriteQuestions();
        if (!aborted) {
          setQuestions(Array.isArray(data?.results) ? data.results : []);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "收藏题目加载失败，请稍后重试。");
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    loadFavorites();
    return () => {
      aborted = true;
    };
  }, [reloadKey]);

  const countsBySkill = useMemo(() => {
    const counts = { ALL: questions.length };
    questions.forEach((question) => {
      counts[question.skill] = (counts[question.skill] || 0) + 1;
    });
    return counts;
  }, [questions]);

  const visibleQuestions = useMemo(() => {
    if (activeSkill === "ALL") return questions;
    return questions.filter((question) => question.skill === activeSkill);
  }, [activeSkill, questions]);

  async function handleRemove(question) {
    if (pendingIds.has(question.id)) return;
    setPendingIds((previous) => new Set(previous).add(question.id));
    setErrorText("");
    try {
      await removeFavoriteQuestion(question);
      setQuestions((previous) => previous.filter((item) => item.id !== question.id));
    } catch (error) {
      setErrorText(error?.message || "取消收藏失败，请稍后重试。");
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(question.id);
        return next;
      });
    }
  }

  return (
    <div className="favorite-questions-page">
      <section className="favorite-questions-header">
        <div>
          <p className="favorite-questions-eyebrow">MEINE PRÜFUNGSFRAGEN</p>
          <h1>收藏题目</h1>
          <p>集中复习你在备考季各个题型中收藏的题目。</p>
        </div>
        <div className="favorite-questions-total" aria-label={`共 ${questions.length} 道收藏题目`}>
          <strong>{questions.length}</strong>
          <span>道题</span>
        </div>
      </section>

      <div className="favorite-questions-tabs" role="tablist" aria-label="按技能筛选收藏题目">
        {SKILL_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={activeSkill === filter.key}
            className={["favorite-questions-tab", activeSkill === filter.key ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={() => setActiveSkill(filter.key)}
          >
            {filter.label}
            <span>{countsBySkill[filter.key] || 0}</span>
          </button>
        ))}
      </div>

      {errorText ? (
        <div className="favorite-questions-message is-error" role="alert">
          <span>{errorText}</span>
          {loading ? null : (
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button>
          )}
        </div>
      ) : null}

      {loading ? <div className="favorite-questions-message">收藏题目加载中...</div> : null}

      {!loading && !errorText && visibleQuestions.length === 0 ? (
        <div className="favorite-questions-empty">
          <span className="favorite-questions-empty__star" aria-hidden="true">☆</span>
          <h2>{questions.length ? "这个分类还没有收藏题目" : "还没有收藏题目"}</h2>
          <p>在备考季做题时点击题目旁边的星标，之后就能在这里快速找到它。</p>
          <Link to="/modules/exam-preparation">前往备考季</Link>
        </div>
      ) : null}

      {!loading && visibleQuestions.length > 0 ? (
        <section className="favorite-questions-grid" aria-label="收藏题目列表">
          {visibleQuestions.map((question) => {
            const skillMeta = SKILL_META[question.skill] || { label: question.skill, className: "" };
            const title = String(question.title || "").trim() || `题目 ${question.external_id || question.exercise_id}`;
            const preview = normalizePreview(question.question_text) || "打开题目继续练习。";
            const context = normalizePreview(question.context_text);
            const pending = pendingIds.has(question.id);

            return (
              <article key={question.id} className="favorite-question-card">
                <div className="favorite-question-card__top">
                  <div className="favorite-question-card__badges">
                    <span className={`favorite-question-card__skill ${skillMeta.className}`}>{skillMeta.label}</span>
                    <span className="favorite-question-card__level">{question.level}</span>
                    {question.is_real_exam ? <span className="favorite-question-card__real">真题</span> : null}
                  </div>
                  <button
                    type="button"
                    className="favorite-question-card__star is-favorited"
                    aria-label="取消收藏"
                    title="取消收藏"
                    disabled={pending}
                    onClick={() => handleRemove(question)}
                  >
                    {pending ? "…" : "★"}
                  </button>
                </div>

                <Link to={question.href} className="favorite-question-card__link">
                  <p className="favorite-question-card__label">{question.question_label}</p>
                  <h2>{title}</h2>
                  <p className="favorite-question-card__preview">{renderQuestionPreview(preview)}</p>
                  {context && context !== preview ? (
                    <p className="favorite-question-card__context">{context}</p>
                  ) : null}
                  <div className="favorite-question-card__footer">
                    <span>{question.external_id || question.exam_type || ""}</span>
                    <strong>打开题目 <span aria-hidden="true">→</span></strong>
                  </div>
                </Link>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
