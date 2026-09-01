import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWritingExercises } from "../api/exam_preparation/writingExercises.js";
import { showExamPreparationPurchasePrompt } from "../utils/examPreparationTrial.js";
import "./ExamPreparationWritingPage.css";

function extractPreview(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export default function ExamPreparationWritingPage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let aborted = false;

    async function loadExercises() {
      try {
        setLoading(true);
        setErrorText("");
        const data = await fetchWritingExercises();
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
  }, []);

  return (
    <div className="writing-page">
      <div className="writing-topbar">
        <Link to="/modules/exam-preparation" className="writing-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="writing-hero">
        <div>
          <p className="writing-hero__eyebrow">Schreiben</p>
          <h1 className="writing-hero__title">写作模块</h1>
          <p className="writing-hero__copy">
            这里用于集中练习书面表达。你可以选择具体题目进入写作页面，围绕题目要求组织内容，并在完成后查看自己的作答与示例答案。
          </p>
          <div className="writing-hero__tags" aria-label="写作模块特点">
            <span className="writing-hero__tag">书面表达训练</span>
            <span className="writing-hero__tag">按题目进入</span>
            <span className="writing-hero__tag">适合考前练习</span>
          </div>
        </div>
      </section>

      {loading ? <p className="writing-state">写作练习加载中...</p> : null}
      {errorText ? <p className="writing-state writing-state--error">{errorText}</p> : null}

      {!loading && !errorText ? (
        <section className="writing-list-grid" aria-label="写作练习列表">
          {exercises.map((exercise, index) => {
            const title = `写作练习 ${index + 1}`;
            const preview = extractPreview(exercise?.request_text) || "进入后查看完整题目要求并开始书面作答练习。";
            const timeLimit = exercise?.time_limit_minutes ? `${exercise.time_limit_minutes} 分钟` : "不限时";
            const wordsLimit = exercise?.words_limit ? `${exercise.words_limit} 词` : "字数不限";
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

                <p className="writing-entry-card__description">{preview}</p>

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
                onClick={() => showExamPreparationPurchasePrompt(navigate)}
              >
                {cardContent}
              </button>
            ) : (
              <Link
                key={exercise.id || index}
                to={`/modules/exam-preparation/schreiben/${exercise.id}`}
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
