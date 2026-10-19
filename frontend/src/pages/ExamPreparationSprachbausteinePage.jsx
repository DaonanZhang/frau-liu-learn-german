import { Link, Navigate, useParams } from "react-router-dom";
import { SPRACHBAUSTEINE_TYPES } from "./examPreparationTypeContent.js";
import "./ExamPreparationSprachbausteinePage.css";
import { examPreparationScope } from "../utils/examPreparationScope.js";

export default function ExamPreparationSprachbausteinePage() {
  const scope = examPreparationScope(useParams().level);
  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;
  return (
    <div className="exam-sprach-page">
      <div className="exam-sprach-topbar">
        <Link to={`/modules/exam-preparation/${scope.levelPath}`} className="exam-sprach-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-sprach-hero">
        <div>
          <p className="exam-sprach-hero__eyebrow">Sprachbausteine</p>
          <h1 className="exam-sprach-hero__title">语法模块</h1>
          <p className="exam-sprach-hero__copy">
            训练 {scope.examType} {scope.level} Sprachbausteine 的两个部分，通过语法选择和备选词填空巩固语法结构、词汇搭配与上下文理解。
          </p>
        </div>
      </section>

      <section className="exam-sprach-type-grid" aria-label="语法题型列表">
        {SPRACHBAUSTEINE_TYPES.map((item) => (
          <Link key={item.key} to={item.to.replace("/modules/exam-preparation/", `/modules/exam-preparation/${scope.levelPath}/`)} className="exam-sprach-type exam-sprach-type--link">
            <div className="exam-sprach-type__top">
              <h2 className="exam-sprach-type__title">{item.title}</h2>
            </div>
            <p className="exam-sprach-type__description">{item.description}</p>
            <div className="exam-sprach-type__bottom">
              <span className="exam-sprach-type__cta">{item.cta}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
