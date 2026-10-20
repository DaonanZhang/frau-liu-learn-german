import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { fetchWritingExercises } from "../api/exam_preparation/writingExercises.js";
import { useAuth } from "../api/auth/useAuth.js";
import { showExamPreparationPurchasePrompt } from "../utils/examPreparationTrial.js";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import { writingCardContent, writingWordLimitLabel } from "./writingDisplay.js";
import "./ExamPreparationWritingPage.css";

export default function ExamPreparationWritingPage() {
  const scope = examPreparationScope(useParams().level);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let aborted = false;

    async function loadExercises() {
      try {
        setLoading(true);
        setErrorText("");
        if (!scope) return;
        const data = await fetchWritingExercises(scope);
        if (!aborted) {
          setExercises(Array.isArray(data?.results) ? data.results : []);
        }
      } catch (error) {
        if (!aborted) {
          setErrorText(error?.message || "写作练习加载失败。");
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
  }, [scope?.level]);

  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;

  return (
    <div className="writing-page">
      <div className="writing-topbar">
        <Link to={`/modules/exam-preparation/${scope.levelPath}`} className="writing-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="writing-hero">
        <div>
          <p className="writing-hero__eyebrow">Schreiben</p>
          <h1 className="writing-hero__title">写作模块</h1>
          <p className="writing-hero__copy">
            考试时间 30 分钟。根据朋友或机构发来的电子邮件完成回复，必须涵盖题目给出的 4 个提示要点（Leitpunkte），并注意书信格式、恰当语体与逻辑连贯性。
          </p>
        </div>
      </section>

      {loading ? <p className="writing-state">写作练习加载中...</p> : null}
      {errorText ? <p className="writing-state writing-state--error">{errorText}</p> : null}

      {!loading && !errorText ? (
        <section className="writing-list-grid" aria-label="写作练习列表">
          {exercises.map((exercise, index) => {
            const { title, preview } = writingCardContent(exercise);
            const timeLimit = exercise?.time_limit_minutes ? `${exercise.time_limit_minutes} 分钟` : "不限时";
            const wordsLimit = writingWordLimitLabel(exercise);
            const isLocked = Boolean(exercise?.is_locked);
            const showFreeTrialBadge = Boolean(exercise?.show_free_trial_badge);

            const cardContent = (
              <>
                <div className="writing-entry-card__top">
                  <div className="writing-entry-card__meta">
                    <div className="writing-entry-card__badges">
                      <span className="writing-entry-card__chip">写作任务</span>
                      {showFreeTrialBadge ? (
                        <span className="writing-entry-card__trial-badge" aria-label="免费试用">
                          免费试用
                        </span>
                      ) : null}
                    </div>
                    <span className="writing-entry-card__focus">书面表达</span>
                  </div>
                  <h2 className="writing-entry-card__title">{title}</h2>
                </div>

                {isLocked ? (
                  <span className="writing-entry-card__lock" aria-hidden="true">🔒</span>
                ) : null}

                {preview ? <p className="writing-entry-card__description">{preview}</p> : null}

                <div className="writing-entry-card__facts">
                  <span className="writing-entry-card__fact">{timeLimit}</span>
                  <span className="writing-entry-card__fact">{wordsLimit}</span>
                </div>

                <div className="writing-entry-card__bottom">
                  <span className="writing-entry-card__cta">
                    {isLocked ? "购买后解锁" : "进入题目"}
                  </span>
                </div>
              </>
            );

            return isLocked ? (
              <button
                key={exercise.id || index}
                type="button"
                className="writing-entry-card writing-entry-card--locked"
                onClick={() => showExamPreparationPurchasePrompt(navigate, user, scope)}
              >
                {cardContent}
              </button>
            ) : (
              <Link
                key={exercise.id || index}
                to={`/modules/exam-preparation/${scope.levelPath}/schreiben/${exercise.id}`}
                className="writing-entry-card"
              >
                {cardContent}
              </Link>
            );
          })}
        </section>
      ) : null}

      {!loading && !errorText && exercises.length === 0 ? (
        <p className="writing-state">暂时还没有可用的写作练习。</p>
      ) : null}
    </div>
  );
}
