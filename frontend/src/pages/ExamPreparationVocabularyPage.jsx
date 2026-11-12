import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fetchVocabularyCards } from "../api/exam_preparation/vocabularyCards.js";
import ExamVocabularyCard from "../components/examPreparation/ExamVocabularyCard.jsx";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import "./ExamPreparationVocabularyPage.css";

export default function ExamPreparationVocabularyPage() {
  const scope = examPreparationScope("C1");
  const [cards, setCards] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage, append = false) => {
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(""); }
    try {
      const data = await fetchVocabularyCards({ page: nextPage });
      const results = Array.isArray(data) ? data : data?.results || [];
      setCards((current) => append ? [...current, ...results] : results);
      setPage(nextPage);
      setHasMore(Boolean(data?.next));
    } catch {
      setError("词汇加载失败，请重试。");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  if (!scope) return <Navigate to="/modules/exam-preparation/c1" replace />;
  return <main className="exam-vocabulary-page">
    <Link className="exam-vocabulary-page__back" to="/modules/exam-preparation/c1">← 返回 C1 备考季</Link>
    <h1>Wortschatz</h1>
    {loading ? <p role="status">正在加载词汇…</p> : error ? <p role="alert">{error}</p> : cards.length ? <>
      <div className="exam-vocabulary-page__grid">{cards.map((entry) => <ExamVocabularyCard key={entry.id} entry={{ card: entry }} />)}</div>
      {hasMore ? <button className="exam-vocabulary-page__more" type="button" disabled={loadingMore} onClick={() => load(page + 1, true)}>{loadingMore ? "正在加载…" : "加载更多"}</button> : null}
    </> : <p className="exam-vocabulary-page__empty">暂无词汇</p>}
  </main>;
}
