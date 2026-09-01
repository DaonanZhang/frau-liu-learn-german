import { Link } from "react-router-dom";
import "./ExamPreparationListeningPage.css";

const LISTENING_TYPES = [
  {
    key: "short-text-prep",
    title: "Teil 1",
    description:
      "适合先看题目再进入听力的练习方式。你可以先整理关键信息，再通过录音判断内容是否正确，帮助自己建立更稳定的听题节奏。",
    to: "/modules/exam-preparation/hoeren/short-text-prep",
    cta: "进入这一题型",
  },
  {
    key: "short-text-once",
    title: "Teil 2",
    description:
      "更接近正式考试中的即时反应训练。你需要一边听，一边快速抓住重点并完成判断，适合强化第一遍获取信息的能力。",
    to: "/modules/exam-preparation/hoeren/short-text-once",
    cta: "进入这一题型",
  },
  {
    key: "dialog-twice",
    title: "Teil 3",
    description:
      "围绕较长对话展开，更适合训练连续理解、人物关系和细节捕捉。通过完整听对话并集中作答，可以提升整体听力稳定性。",
    to: "/modules/exam-preparation/hoeren/dialog-twice",
    cta: "进入这一题型",
  },
];

export default function ExamPreparationListeningPage() {
  return (
    <div className="exam-listening-page">
      <div className="exam-listening-topbar">
        <Link to="/modules/exam-preparation" className="exam-listening-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-listening-hero">
        <div>
          <p className="exam-listening-hero__eyebrow">Hören</p>
          <h1 className="exam-listening-hero__title">听力模块</h1>
          <p className="exam-listening-hero__copy">
            这里汇集了不同类型的听力练习。你可以根据自己的复习重点，选择更适合当前阶段的题型，练习听关键信息、判断正误以及理解完整对话。
          </p>
          <div className="exam-listening-hero__tags" aria-label="听力模块特点">
            <span className="exam-listening-hero__tag">分题型练习</span>
            <span className="exam-listening-hero__tag">逐项强化听力</span>
            <span className="exam-listening-hero__tag">适合考前集中复习</span>
          </div>
        </div>
      </section>

      <section className="exam-listening-type-grid" aria-label="听力题型列表">
        {LISTENING_TYPES.map((item) => (
          <Link key={item.key} to={item.to} className="exam-listening-type exam-listening-type--link">
            <div className="exam-listening-type__top">
              <h2 className="exam-listening-type__title">{item.title}</h2>
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
