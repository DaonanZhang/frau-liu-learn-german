import { Link, Navigate, useParams } from "react-router-dom";
import { READING_TYPES, examPreparationTypeDescription, examPreparationTypesForLevel } from "./examPreparationTypeContent.js";
import "./ExamPreparationReadingPage.css";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import { useExamPreparationStatistics } from "../hooks/useExamPreparationStatistics.js";
import ExamPreparationCountMeta from "../components/examPreparation/ExamPreparationCountMeta.jsx";

export default function ExamPreparationReadingPage() {
  const scope = examPreparationScope(useParams().level);
  const statistics = useExamPreparationStatistics();
  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;
  const typeCounts = statistics?.[scope.level]?.types;
  return (
    <div className="exam-reading-page">
      <div className="exam-reading-topbar">
        <Link to={`/modules/exam-preparation/${scope.levelPath}`} className="exam-reading-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-reading-hero">
        <div>
          <p className="exam-reading-hero__eyebrow">Lesen</p>
          <h1 className="exam-reading-hero__title">阅读模块</h1>
          <p className="exam-reading-hero__copy">
            {scope.level === "C1" ? "完成选词填空、分类广告匹配和长文理解。" : `训练 ${scope.examType} ${scope.level} 阅读的三个部分：短文本标题匹配、长文理解选择，以及生活情境与分类广告匹配。`}
          </p>
        </div>
      </section>

      <section className="exam-reading-type-grid" aria-label="阅读题型列表">
        {examPreparationTypesForLevel(READING_TYPES, scope.level).map((item, index) => {
          const countKey = scope.level === "C1"
            ? ["CLOZE_MATCHING", "READING_UNDERSTANDING", "READING_AD_MATCHING"][index]
            : ["READING_TITLE_MATCHING", "READING_UNDERSTANDING", "READING_AD_MATCHING"][index];
          const content = (
            <>
              <div className="exam-reading-type__top">
                <h2 className="exam-reading-type__title">{item.title}</h2>
              </div>
              <p className="exam-reading-type__description">{examPreparationTypeDescription(item, scope.level)}</p>
              <ExamPreparationCountMeta items={[{ value: typeCounts?.[countKey], label: "道题目" }]} />
              <div className="exam-reading-type__bottom">
                {item.to ? (
                  <span className="exam-reading-type__cta">{item.cta}</span>
                ) : (
                  <span className="exam-reading-type__soon">即将开放</span>
                )}
              </div>
            </>
          );

          if (item.to) {
            return (
              <Link key={item.key} to={item.to.replace("/modules/exam-preparation/", `/modules/exam-preparation/${scope.levelPath}/`)} className="exam-reading-type exam-reading-type--link">
                {content}
              </Link>
            );
          }

          return (
            <article key={item.key} className="exam-reading-type exam-reading-type--muted">
              {content}
            </article>
          );
        })}
      </section>
    </div>
  );
}
