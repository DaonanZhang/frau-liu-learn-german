import { Link, Navigate, useParams } from "react-router-dom";
import { LISTENING_TYPES, examPreparationTypeDescription } from "./examPreparationTypeContent.js";
import "./ExamPreparationListeningPage.css";
import { examPreparationScope } from "../utils/examPreparationScope.js";

export default function ExamPreparationListeningPage() {
  const scope = examPreparationScope(useParams().level);
  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;
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
            训练 {scope.examType} {scope.level} 听力的三个部分，在规定播放次数内捕捉关键信息。
          </p>
        </div>
      </section>

      <section className="exam-listening-type-grid" aria-label="听力题型列表">
        {LISTENING_TYPES.map((item) => (
          <Link key={item.key} to={item.to.replace("/modules/exam-preparation/", `/modules/exam-preparation/${scope.levelPath}/`)} className="exam-listening-type exam-listening-type--link">
            <div className="exam-listening-type__top">
              <h2 className="exam-listening-type__title">{item.title}</h2>
            </div>
            <p className="exam-listening-type__description">{examPreparationTypeDescription(item, scope.level)}</p>
            <div className="exam-listening-type__bottom">
              <span className="exam-listening-type__cta">{item.cta}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
