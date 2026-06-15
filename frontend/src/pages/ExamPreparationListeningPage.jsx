import { Link } from "react-router-dom";
import "./ExamPreparationListeningPage.css";

const LISTENING_TYPES = [
  {
    key: "short-text-prep",
    title: "LISTENING_SHORT_TEXT_PREP",
    label: "Kurze Texte mit Vorbereitungszeit",
    description:
      "五段短听力，先读 Aufgaben 1-5，再听一次并判断 richtig 或 falsch。",
    to: "/modules/exam-preparation/hoeren/short-text-prep",
    cta: "进入第一题型",
  },
  {
    key: "short-text-once",
    title: "LISTENING_SHORT_TEXT_ONCE",
    label: "Kurze Texte einmal hören",
    description:
      "五段短听力，直接听并判断 Aussagen 是否 richtig oder falsch。",
    to: "/modules/exam-preparation/hoeren/short-text-once",
    cta: "进入第二题型",
  },
  {
    key: "dialog-twice",
    title: "LISTENING_DIALOG_TWICE",
    label: "Gespräch zweimal hören",
    description:
      "一段对话配 10 道判断题，可播放、重复并统一在最后 Prüfen。",
    to: "/modules/exam-preparation/hoeren/dialog-twice",
    cta: "进入第三题型",
  },
];

export default function ExamPreparationListeningPage() {
  return (
    <div className="exam-listening-page">
      <div className="exam-listening-topbar">
        <Link to="/modules/exam-preparation" className="exam-listening-topbar__back">
          ← Zurück zu Exam Preparation
        </Link>
      </div>

      <section className="exam-listening-hero">
        <div>
          <p className="exam-listening-hero__eyebrow">Hören</p>
          <h1 className="exam-listening-hero__title">听力模块</h1>
          <p className="exam-listening-hero__copy">
            听力先按三种说明文本区分题型。当前布局统一，差异只体现在 instruction 和题目数量上。
          </p>
        </div>
      </section>

      <section className="exam-listening-type-grid">
        {LISTENING_TYPES.map((item) => (
          <Link key={item.key} to={item.to} className="exam-listening-type exam-listening-type--link">
            <div className="exam-listening-type__top">
              <span className="exam-listening-type__mono">{item.title}</span>
              <h2 className="exam-listening-type__title">{item.label}</h2>
            </div>
            <p className="exam-listening-type__description">{item.description}</p>
            <div className="exam-listening-type__bottom">
              <span className="exam-listening-type__cta">{item.cta}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
