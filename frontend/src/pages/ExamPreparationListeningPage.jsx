import { Link, Navigate, useParams } from "react-router-dom";
import { LISTENING_TYPES, examPreparationTypeDescription } from "./examPreparationTypeContent.js";
import "./ExamPreparationListeningPage.css";
import { examPreparationScope } from "../utils/examPreparationScope.js";
import { useExamPreparationStatistics } from "../hooks/useExamPreparationStatistics.js";
import ExamPreparationCountMeta from "../components/examPreparation/ExamPreparationCountMeta.jsx";

export default function ExamPreparationListeningPage() {
  const scope = examPreparationScope(useParams().level);
  const statistics = useExamPreparationStatistics();
  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;
  const typeCounts = statistics?.[scope.level]?.types;
  const countKeys = ["LISTENING_TEIL1", "LISTENING_TEIL2", "LISTENING_TEIL3"];
  return (
    <div className="exam-listening-page">
      <div className="exam-listening-topbar">
        <Link to={`/modules/exam-preparation/${scope.levelPath}`} className="exam-listening-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-listening-hero">
        <div>
          <p className="exam-listening-hero__eyebrow">Hören</p>
          <h1 className="exam-listening-hero__title">听力模块</h1>
          <p className="exam-listening-hero__copy">
            {scope.level === "C1" ? "训练短对话说话人匹配、听力选择题和演讲笔记补全。" : `训练 ${scope.examType} ${scope.level} 听力的三个部分，在规定播放次数内捕捉关键信息。`}
          </p>
        </div>
      </section>

      <section className="exam-listening-type-grid" aria-label="听力题型列表">
        {LISTENING_TYPES.map((item, index) => (
          <Link key={item.key} to={item.to.replace("/modules/exam-preparation/", `/modules/exam-preparation/${scope.levelPath}/`)} className="exam-listening-type exam-listening-type--link">
            <div className="exam-listening-type__top">
              <h2 className="exam-listening-type__title">{item.title}</h2>
            </div>
            <p className="exam-listening-type__description">{examPreparationTypeDescription(item, scope.level)}</p>
            <ExamPreparationCountMeta items={[{ value: typeCounts?.[countKeys[index]], label: "道题目" }]} />
            <div className="exam-listening-type__bottom">
              <span className="exam-listening-type__cta">{item.cta}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
