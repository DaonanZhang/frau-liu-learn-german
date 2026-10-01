import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchExamPreparationContentSearch } from "../../api/exam_preparation/contentSearch.js";
import "./ExamPreparationContentSearch.css";

const SKILL_OPTIONS = [
  ["", "全部模块"],
  ["listening", "Hören"],
  ["reading", "Lesen"],
  ["sprachbausteine", "Sprachbausteine"],
  ["writing", "Schreiben"],
  ["speaking", "Sprechen"],
];

const TEIL_OPTIONS = {
  listening: [1, 2, 3],
  reading: [1, 2, 3],
  sprachbausteine: [1, 2],
  speaking: [1, 2, 3],
};

const COLLAPSED_MATCH_COUNT = 5;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }) {
  const terms = useMemo(
    () => [...new Set(query.trim().split(/\s+/).filter(Boolean))],
    [query],
  );
  if (!terms.length) return text;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const foldedTerms = new Set(terms.map((term) => term.toLocaleLowerCase()));
  return String(text).split(pattern).map((part, index) => (
    foldedTerms.has(part.toLocaleLowerCase())
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part
  ));
}

export default function ExamPreparationContentSearch() {
  const [draftQuery, setDraftQuery] = useState("");
  const [draftSkill, setDraftSkill] = useState("");
  const [draftTeil, setDraftTeil] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [expandedResults, setExpandedResults] = useState(() => new Set());

  useEffect(() => {
    if (!submitted) return undefined;
    let cancelled = false;

    async function loadResults() {
      setLoading(true);
      setErrorText("");
      try {
        const response = await fetchExamPreparationContentSearch({ ...submitted, page });
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled) {
          setData(null);
          setErrorText("搜索失败，请稍后重试。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadResults();
    return () => {
      cancelled = true;
    };
  }, [submitted, page]);

  function submitSearch(event) {
    event.preventDefault();
    const query = draftQuery.trim();
    if (!query) return;
    setPage(1);
    setData(null);
    setExpandedResults(new Set());
    setSubmitted({ query, skill: draftSkill, teil: draftTeil });
  }

  function changeSkill(event) {
    setDraftSkill(event.target.value);
    setDraftTeil("");
  }

  function toggleMatches(exerciseBaseId) {
    setExpandedResults((current) => {
      const next = new Set(current);
      if (next.has(exerciseBaseId)) next.delete(exerciseBaseId);
      else next.add(exerciseBaseId);
      return next;
    });
  }

  const teilOptions = TEIL_OPTIONS[draftSkill] || [];
  const results = Array.isArray(data?.results) ? data.results : [];

  return (
    <section className="exam-content-search" aria-labelledby="exam-content-search-title">
      <div className="exam-content-search__heading">
        <h2 id="exam-content-search-title">题库搜索</h2>
      </div>

      <form className="exam-content-search__form" role="search" onSubmit={submitSearch}>
        <label className="exam-content-search__field exam-content-search__field--query">
          <span>搜索内容</span>
          <input
            type="search"
            value={draftQuery}
            maxLength={200}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="输入标题、题目、答案或正文"
          />
        </label>

        <label className="exam-content-search__field exam-content-search__field--module">
          <span>模块</span>
          <span className="exam-content-search__select-shell">
            <select value={draftSkill} onChange={changeSkill}>
              {SKILL_OPTIONS.map(([value, label]) => (
                <option key={value || "all"} value={value}>{label}</option>
              ))}
            </select>
          </span>
        </label>

        {teilOptions.length ? (
          <label className="exam-content-search__field">
            <span>Teil</span>
            <select value={draftTeil} onChange={(event) => setDraftTeil(event.target.value)}>
              <option value="">全部 Teil</option>
              {teilOptions.map((teil) => (
                <option key={teil} value={teil}>Teil {teil}</option>
              ))}
            </select>
          </label>
        ) : null}

        <button className="exam-content-search__submit" type="submit" disabled={loading}>
          搜索
        </button>
      </form>

      {loading ? <p className="exam-content-search__state">正在搜索…</p> : null}
      {errorText ? <p className="exam-content-search__state is-error">{errorText}</p> : null}
      {!loading && !errorText && data && results.length === 0 ? (
        <p className="exam-content-search__state">没有找到相关题库内容。</p>
      ) : null}

      {!loading && !errorText && results.length ? (
        <div className="exam-content-search__results" aria-live="polite">
          <p className="exam-content-search__summary">找到 {data.count} 道练习</p>
          {results.map((item) => {
            const expanded = expandedResults.has(item.exercise_base_id);
            const matches = expanded ? item.matches : item.matches.slice(0, COLLAPSED_MATCH_COUNT);
            const hiddenCount = Math.max(0, item.matches.length - COLLAPSED_MATCH_COUNT);
            return (
              <article key={item.exercise_base_id} className="exam-content-search__card">
                <div className="exam-content-search__card-heading">
                  <div>
                    <p className="exam-content-search__meta">
                      {item.skill_label}{item.teil ? ` · Teil ${item.teil}` : ""}
                    </p>
                    <h3>{item.title}</h3>
                  </div>
                  <Link to={item.href}>打开题目</Link>
                </div>

                <div className="exam-content-search__matches">
                  {matches.map((match, index) => (
                    <div key={`${match.label}-${index}`} className="exam-content-search__match">
                      <strong>{match.label}</strong>
                      <p><HighlightedText text={match.excerpt} query={submitted.query} /></p>
                    </div>
                  ))}
                </div>

                {hiddenCount ? (
                  <button
                    type="button"
                    className="exam-content-search__expand"
                    onClick={() => toggleMatches(item.exercise_base_id)}
                  >
                    {expanded ? "收起" : `展开其余 ${hiddenCount} 条`}
                  </button>
                ) : null}
              </article>
            );
          })}

          {data.total_pages > 1 ? (
            <nav className="exam-content-search__pagination" aria-label="搜索结果分页">
              <button type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
                上一页
              </button>
              <span>第 {data.page} / {data.total_pages} 页</span>
              <button type="button" disabled={data.page >= data.total_pages || loading} onClick={() => setPage((value) => value + 1)}>
                下一页
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
