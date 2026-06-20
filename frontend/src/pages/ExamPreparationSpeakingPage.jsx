import { Link } from "react-router-dom";
import "./ExamPreparationSpeakingPage.css";

const SPEAKING_TYPES = [
  {
    key: "gap-matching",
    title: "SPEAKING_GAP_MATCHING",
    label: "Lückentext mit Satzoptionen",
    description: "带空格的口语文本配选项池，按空位选择最合适的句子，并在 Prüfen 后保存当前作答状态。",
    to: "/modules/exam-preparation/sprechen/gap-matching",
    cta: "进入第一题型",
  },
  {
    key: "prompt-segmented",
    title: "SPEAKING_PROMPT_SEGMENTED",
    label: "Prompt mit geordneten Abschnitten",
    description: "给出题目和被切分的范文段落，按顺序整理答案，并在 Prüfen 后保存当前结果。",
    to: "/modules/exam-preparation/sprechen/prompt-segmented",
    cta: "进入第二题型",
  },
];

export default function ExamPreparationSpeakingPage() {
  return (
    <div className="exam-speaking-page">
      <div className="exam-speaking-topbar">
        <Link to="/modules/exam-preparation" className="exam-speaking-topbar__back">
          ← Zurück zu Exam Preparation
        </Link>
      </div>

      <section className="exam-speaking-hero">
        <div>
          <p className="exam-speaking-hero__eyebrow">Sprechen</p>
          <h1 className="exam-speaking-hero__title">口语模块</h1>
          <p className="exam-speaking-hero__copy">
            口语模块当前包含两种题型：带空位的匹配题，以及基于范文分段顺序的组织练习。
          </p>
        </div>
      </section>

      <section className="exam-speaking-type-grid">
        {SPEAKING_TYPES.map((item) => (
          <Link key={item.key} to={item.to} className="exam-speaking-type exam-speaking-type--link">
            <div className="exam-speaking-type__top">
              <span className="exam-speaking-type__mono">{item.title}</span>
              <h2 className="exam-speaking-type__title">{item.label}</h2>
            </div>
            <p className="exam-speaking-type__description">{item.description}</p>
            <div className="exam-speaking-type__bottom">
              <span className="exam-speaking-type__cta">{item.cta}</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
