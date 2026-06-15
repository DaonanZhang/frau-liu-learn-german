import { Link } from "react-router-dom";
import "./ExamPreparationSprachbausteinePage.css";

const SPRACHBAUSTEINE_TYPES = [
  {
    key: "cloze-choice",
    title: "CLOZE_CHOICE",
    label: "Lückentext mit Einzeloptionen",
    description: "每个空格各自拥有一组选项，适合逐题判断语法和词汇搭配。",
    to: "/modules/exam-preparation/sprachbausteine/cloze-choice",
    cta: "进入第一题型",
  },
  {
    key: "cloze-matching",
    title: "CLOZE_MATCHING",
    label: "Lückentext mit gemeinsamem Pool",
    description: "多个空格共享同一个选项池，更接近真正的 Sprachbausteine 配对模式。",
    to: "/modules/exam-preparation/sprachbausteine/cloze-matching",
    cta: "进入第二题型",
  },
];

export default function ExamPreparationSprachbausteinePage() {
  return (
    <div className="exam-sprach-page">
      <div className="exam-sprach-topbar">
        <Link to="/modules/exam-preparation" className="exam-sprach-topbar__back">
          ← Zurück zu Exam Preparation
        </Link>
      </div>

      <section className="exam-sprach-hero">
        <div>
          <p className="exam-sprach-hero__eyebrow">Sprachbausteine</p>
          <h1 className="exam-sprach-hero__title">语法模块</h1>
          <p className="exam-sprach-hero__copy">
            这里预留给完形填空和语法词汇专项。后面可以直接在这个模块下拆成两个具体题型，不需要再改顶层导航。
          </p>
        </div>
      </section>

      <section className="exam-sprach-type-grid">
        {SPRACHBAUSTEINE_TYPES.map((item) => (
          <Link key={item.key} to={item.to} className="exam-sprach-type exam-sprach-type--link">
            <div className="exam-sprach-type__top">
              <span className="exam-sprach-type__mono">{item.title}</span>
              <h2 className="exam-sprach-type__title">{item.label}</h2>
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
