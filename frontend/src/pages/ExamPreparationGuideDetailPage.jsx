import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import {
  fetchGuideDetail,
  guideMatchesLevel,
  setGuideLiked,
} from "../api/exam_preparation/guides.js";
import GuideMarkdown from "../components/examPreparation/GuideMarkdown.jsx";
import { examPreparationModuleName, examPreparationScope } from "../utils/examPreparationScope.js";
import "./ExamPreparationModulePage.css";
import "./ExamPreparationGuideDetailPage.css";

export default function ExamPreparationGuideDetailPage() {
  const { level, guideId } = useParams();
  const scope = examPreparationScope(level);
  const scopeLevel = scope?.level;
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [likeErrorText, setLikeErrorText] = useState("");
  const [likePending, setLikePending] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrationTimerRef = useRef(null);

  useEffect(() => {
    if (!scopeLevel) return undefined;
    let cancelled = false;

    async function loadGuide() {
      try {
        setLoading(true);
        setErrorText("");
        const detail = await fetchGuideDetail(guideId);
        if (cancelled) return;
        if (!detail || !guideMatchesLevel(detail, scopeLevel)) {
          setErrorText("没有找到这篇攻略。");
          return;
        }
        setGuide(detail);
      } catch {
        if (!cancelled) setErrorText("攻略加载失败，请稍后重试。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadGuide();
    return () => {
      cancelled = true;
    };
  }, [guideId, scopeLevel]);

  useEffect(() => () => {
    if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
  }, []);

  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;

  const tipsPath = `/modules/exam-preparation/${scope.levelPath}/tips`;
  const moduleName = examPreparationModuleName(scope);

  async function toggleLike() {
    if (!guide || likePending) return;

    const previousGuide = guide;
    const nextLiked = !guide.is_liked;
    const nextCount = Math.max(0, Number(guide.like_count || 0) + (nextLiked ? 1 : -1));
    setLikeErrorText("");
    setLikePending(true);
    setGuide({ ...guide, is_liked: nextLiked, like_count: nextCount });

    if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    setCelebrating(nextLiked);
    if (nextLiked) {
      celebrationTimerRef.current = window.setTimeout(() => setCelebrating(false), 720);
    }

    try {
      const updated = await setGuideLiked(guide.id, nextLiked);
      setGuide((currentGuide) => ({ ...currentGuide, ...updated }));
      if (!nextLiked) setCelebrating(false);
    } catch {
      setGuide(previousGuide);
      setCelebrating(false);
      setLikeErrorText("点赞失败，请稍后重试。");
    } finally {
      setLikePending(false);
    }
  }

  return (
    <div className="exam-guide-detail-page">
      <Link className="exam-module-page__back" to={tipsPath}>← 返回 {moduleName} 攻略</Link>

      {loading ? <p className="exam-guide-detail-page__state" role="status">攻略加载中…</p> : null}
      {!loading && errorText ? <p className="exam-guide-detail-page__state" role="alert">{errorText}</p> : null}

      {!loading && !errorText && guide ? (
        <article className="exam-guide-detail">
          <header className="exam-guide-detail__header">
            <div className="exam-guide-detail__byline">
              <img src="/images/icon.jpeg" alt={`${guide.author || "Frau Liu"} 网站图标`} />
              <span>{guide.author || "Frau Liu"}</span>
            </div>
            {Array.isArray(guide.badges) && guide.badges.length ? (
              <div className="exam-guide-detail__badges" aria-label="攻略标签">
                {guide.badges.filter(Boolean).map((badge) => <span key={badge}>{badge}</span>)}
              </div>
            ) : null}
            <h1>{guide.title}</h1>
            {guide.cover_url ? <img className="exam-guide-detail__cover" src={guide.cover_url} alt={`${guide.title} 封面`} /> : null}
            {guide.summary ? <p className="exam-guide-detail__summary">{guide.summary}</p> : null}
          </header>

          <div className="exam-guide-markdown">
            <GuideMarkdown>{guide.body_markdown}</GuideMarkdown>
          </div>

          <footer className="exam-guide-detail__actions">
            <div className="exam-guide-detail__metrics">
              <span aria-label={`观看 ${guide.view_count || 0} 次`}><span aria-hidden="true">◉</span> {guide.view_count || 0}</span>
              <span aria-label={`${guide.like_count || 0} 个赞`}><span aria-hidden="true">♥</span> {guide.like_count || 0}</span>
            </div>
            <button
              type="button"
              className={`exam-guide-like-button${guide.is_liked ? " is-liked" : ""}${celebrating ? " is-celebrating" : ""}`}
              aria-pressed={Boolean(guide.is_liked)}
              aria-busy={likePending}
              disabled={likePending}
              onClick={toggleLike}
            >
              <span aria-hidden="true">♥</span>
              {guide.is_liked ? "取消点赞" : "点赞"}
            </button>
            {likeErrorText ? <p className="exam-guide-detail__like-error" role="alert">{likeErrorText}</p> : null}
          </footer>
        </article>
      ) : null}
    </div>
  );
}
