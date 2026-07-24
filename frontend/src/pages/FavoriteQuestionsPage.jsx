import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchFavoriteQuestions,
  removeFavoriteQuestion,
} from "../api/exam_preparation/favoriteQuestions.js";
import "./FavoriteQuestionsPage.css";

const SKILL_FILTERS = [
  { key: "ALL", label: "全部" },
  { key: "LISTENING", label: "听力" },
  { key: "READING", label: "阅读" },
  { key: "SPRACHBAUSTEIN", label: "完形填空" },
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

function groupQuestionsByExercise(questions) {
  const groups = new Map();

  questions.forEach((question) => {
    const key = String(question.exercise_base_id || `${question.state_type}:${question.exercise_id}`);
    const existing = groups.get(key);
    if (existing) {
      existing.questions.push(question);
      return;
    }
    groups.set(key, { key, questions: [question] });
  });

  return Array.from(groups.values());
}

function FavoriteBadges({ question }) {
  const skillMeta = SKILL_META[question.skill] || { label: question.skill, className: "" };

  return (
    <div className="favorite-question-card__badges">
      <span className={`favorite-question-card__skill ${skillMeta.className}`}>{skillMeta.label}</span>
      <span className="favorite-question-card__level">{question.level}</span>
      {question.is_real_exam ? <span className="favorite-question-card__real">真题</span> : null}
      {question.exam_type ? <span className="favorite-question-card__exam-type">{question.exam_type}</span> : null}
    </div>
  );
}

function FavoriteQuestionCard({ question, pending, onRemove }) {
  const title = String(question.title || "").trim() || `题目 ${question.external_id || question.exercise_id}`;
  const preview = normalizePreview(question.question_text) || "打开题目继续练习。";
  const context = normalizePreview(question.context_text);

  return (
    <article className="favorite-question-card">
      <div className="favorite-question-card__top">
        <FavoriteBadges question={question} />
        <button
          type="button"
          className="favorite-question-card__star is-favorited"
          aria-label="取消收藏"
          title="取消收藏"
          disabled={pending}
          onClick={() => onRemove(question)}
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
          <strong>打开题目 <span aria-hidden="true">→</span></strong>
        </div>
      </Link>
    </article>
  );
}

function FavoriteExerciseCard({ group }) {
  const representative = group.questions[0];
  const title = String(representative.title || "").trim()
    || `套题 ${representative.external_id || representative.exercise_id}`;

  return (
    <article className="favorite-question-card favorite-question-card--collection">
      <div className="favorite-question-card__top">
        <FavoriteBadges question={representative} />
        <span className="favorite-question-card__collection-count">{group.questions.length}</span>
      </div>

      <Link
        to={`/favorite-questions?exercise=${encodeURIComponent(group.key)}`}
        className="favorite-question-card__link"
      >
        <p className="favorite-question-card__label">套题收藏</p>
        <h2>{title}</h2>
        <div className="favorite-question-card__footer">
          <strong>查看收藏题目 <span aria-hidden="true">→</span></strong>
        </div>
      </Link>
    </article>
  );
}

export default function FavoriteQuestionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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

  const visibleGroups = useMemo(
    () => groupQuestionsByExercise(visibleQuestions),
    [visibleQuestions],
  );

  const selectedExerciseKey = searchParams.get("exercise");
  const selectedGroup = useMemo(() => {
    if (!selectedExerciseKey) return null;
    const group = groupQuestionsByExercise(questions)
      .find((item) => item.key === selectedExerciseKey);
    return group?.questions.length > 1 ? group : null;
  }, [questions, selectedExerciseKey]);

  useEffect(() => {
    if (selectedExerciseKey && !selectedGroup && !loading) {
      setSearchParams({}, { replace: true });
    }
  }, [loading, selectedExerciseKey, selectedGroup, setSearchParams]);

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
        <h1>收藏题目</h1>
        <div className="favorite-questions-total" aria-label={`共 ${questions.length} 道收藏题目`}>
          <strong>{questions.length}</strong>
          <span>道题</span>
        </div>
      </section>

      {selectedGroup ? (
        <div className="favorite-questions-detail-bar">
          <button type="button" onClick={() => setSearchParams({})}>← 返回全部收藏</button>
          <div>
            <strong>{selectedGroup.questions[0].title || selectedGroup.questions[0].external_id}</strong>
            <span>这套题共收藏 {selectedGroup.questions.length} 道题</span>
          </div>
        </div>
      ) : (
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
      )}

      {errorText ? (
        <div className="favorite-questions-message is-error" role="alert">
          <span>{errorText}</span>
          {loading ? null : (
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button>
          )}
        </div>
      ) : null}

      {loading ? <div className="favorite-questions-message">收藏题目加载中...</div> : null}

      {!loading && !errorText && !selectedGroup && visibleQuestions.length === 0 ? (
        <div className="favorite-questions-empty">
          <span className="favorite-questions-empty__star" aria-hidden="true">☆</span>
          <h2>{questions.length ? "这个分类还没有收藏题目" : "还没有收藏题目"}</h2>
          <p>在备考季做题时点击题目旁边的星标，之后就能在这里快速找到它。</p>
          <Link to="/modules/exam-preparation">前往备考季</Link>
        </div>
      ) : null}

      {!loading && selectedGroup ? (
        <section className="favorite-questions-grid" aria-label="这套题中收藏的题目">
          {selectedGroup.questions.map((question) => (
            <FavoriteQuestionCard
              key={question.id}
              question={question}
              pending={pendingIds.has(question.id)}
              onRemove={handleRemove}
            />
          ))}
        </section>
      ) : null}

      {!loading && !selectedGroup && visibleGroups.length > 0 ? (
        <section className="favorite-questions-grid" aria-label="收藏题目列表">
          {visibleGroups.map((group) => (
            group.questions.length > 1 ? (
              <FavoriteExerciseCard key={group.key} group={group} />
            ) : (
              <FavoriteQuestionCard
                key={group.questions[0].id}
                question={group.questions[0]}
                pending={pendingIds.has(group.questions[0].id)}
                onRemove={handleRemove}
              />
            )
          ))}
        </section>
      ) : null}
    </div>
  );
}
