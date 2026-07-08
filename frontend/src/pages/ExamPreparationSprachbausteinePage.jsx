import { Link } from "react-router-dom";
import "./ExamPreparationSprachbausteinePage.css";

const SPRACHBAUSTEINE_TYPES = [
  {
    key: "cloze-choice",
    title: "逐空选择",
    label: "每个空格单独判断",
    description: "每一空都有对应选项，适合逐题分析词义、语法和固定搭配，帮助你更稳地判断每个空格最自然的表达方式。",
    to: "/modules/exam-preparation/sprachbausteine/cloze-choice",
    cta: "进入这一题型",
    focus: "逐题分析",
  },
  {
    key: "cloze-matching",
    title: "共享选项池",
    label: "多个空格统一匹配",
    description: "多个空格共用同一组选项，更适合训练整体判断能力。你需要同时比较句意、语法和上下文，完成更接近考试的综合匹配。",
    to: "/modules/exam-preparation/sprachbausteine/cloze-matching",
    cta: "进入这一题型",
    focus: "综合匹配",
  },
];

export default function ExamPreparationSprachbausteinePage() {
  return (
    <div className="exam-sprach-page">
      <div className="exam-sprach-topbar">
        <Link to="/modules/exam-preparation" className="exam-sprach-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-sprach-hero">
        <div>
          <p className="exam-sprach-hero__eyebrow">Sprachbausteine</p>
          <h1 className="exam-sprach-hero__title">语法模块</h1>
          <p className="exam-sprach-hero__copy">
            这里主要练习词汇、语法和句子结构的综合运用。你可以根据自己的复习习惯，选择逐空判断，或者进入更接近正式考试的共享选项池题型。
          </p>
          <div className="exam-sprach-hero__tags" aria-label="语法模块特点">
            <span className="exam-sprach-hero__tag">词汇语法训练</span>
            <span className="exam-sprach-hero__tag">提升搭配判断</span>
            <span className="exam-sprach-hero__tag">强化上下文理解</span>
          </div>
        </div>
      </section>

      <section className="exam-sprach-type-grid" aria-label="语法题型列表">
        {SPRACHBAUSTEINE_TYPES.map((item) => (
          <Link key={item.key} to={item.to} className="exam-sprach-type exam-sprach-type--link">
            <div className="exam-sprach-type__top">
              <div className="exam-sprach-type__meta">
                <span className="exam-sprach-type__mono">{item.title}</span>
                <span className="exam-sprach-type__focus">{item.focus}</span>
              </div>
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
