import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { fetchGuides, guideMatchesLevel } from "../api/exam_preparation/guides.js";
import { examPreparationModuleName, examPreparationScope } from "../utils/examPreparationScope.js";
import "./ExamPreparationModulePage.css";
import "./ExamPreparationTipsPage.css";

function formatPublishedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function GuideCard({ guide, levelPath }) {
  const author = guide.author || "Frau Liu";
  const badges = Array.isArray(guide.badges) ? guide.badges.filter(Boolean) : [];
  const publishedDate = formatPublishedDate(guide.published_at);

  return (
    <article className="exam-guide-card">
      <Link className="exam-guide-card__link" to={`/modules/exam-preparation/${levelPath}/tips/${guide.id}`}>
        <div className="exam-guide-card__byline">
          <img className="exam-guide-card__site-icon" src="/images/icon.jpeg" alt={`${author} 网站图标`} />
          <span>{author}</span>
        </div>

        {guide.cover_url ? (
          <img
            className="exam-guide-card__cover"
            src={guide.cover_url}
            alt={`${guide.title} 封面`}
          />
        ) : null}

        {badges.length ? (
          <div className="exam-guide-card__badges" aria-label="攻略标签">
            {badges.map((badge) => <span key={badge}>{badge}</span>)}
          </div>
        ) : null}

        <h2>{guide.title}</h2>
        {guide.summary ? <p className="exam-guide-card__summary">{guide.summary}</p> : null}

        <div className="exam-guide-card__meta">
          <span aria-label={`观看 ${guide.view_count || 0} 次`}>
            <span aria-hidden="true">◉</span> {guide.view_count || 0}
          </span>
          <span aria-label={`${guide.like_count || 0} 个赞`}>
            <span aria-hidden="true">♥</span> {guide.like_count || 0}
          </span>
          {publishedDate ? <time dateTime={guide.published_at}>{publishedDate}</time> : null}
        </div>
      </Link>
    </article>
  );
}

export default function ExamPreparationTipsPage() {
  const { level } = useParams();
  const scope = examPreparationScope(level);
  const scopeLevel = scope?.level;
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!scopeLevel) return undefined;
    let cancelled = false;

    async function loadGuides() {
      try {
        setLoading(true);
        setErrorText("");
        const data = await fetchGuides();
        if (!cancelled) setGuides(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (!cancelled) setErrorText("攻略加载失败，请稍后重试。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGuides();
    return () => {
      cancelled = true;
    };
  }, [scopeLevel, reloadKey]);

  const visibleGuides = useMemo(
    () => (scopeLevel ? guides.filter((guide) => guideMatchesLevel(guide, scopeLevel)) : []),
    [guides, scopeLevel],
  );

  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;
  const moduleName = examPreparationModuleName(scope);

  return (
    <div className="exam-module-page exam-guide-list-page">
      <Link className="exam-module-page__back" to={`/modules/exam-preparation/${scope.levelPath}`}>
        ← 返回 {moduleName}
      </Link>
      <section className="exam-module-hero">
        <div className="exam-module-hero__content">
          <h1 className="exam-module-hero__title">Unsere Tipps</h1>
          <p className="exam-module-hero__copy">{moduleName}</p>
        </div>
      </section>

      {loading ? <p className="exam-guide-list-page__state" role="status">攻略加载中…</p> : null}
      {!loading && errorText ? (
        <div className="exam-guide-list-page__state exam-guide-list-page__state--error" role="alert">
          <p>{errorText}</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>重新加载</button>
        </div>
      ) : null}
      {!loading && !errorText && !visibleGuides.length ? (
        <p className="exam-guide-list-page__state">还没有发布攻略</p>
      ) : null}
      {!loading && !errorText && visibleGuides.length ? (
        <section className="exam-guide-grid" aria-label={`${moduleName} 攻略`}>
          {visibleGuides.map((guide) => (
            <GuideCard key={guide.id} guide={guide} levelPath={scope.levelPath} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
