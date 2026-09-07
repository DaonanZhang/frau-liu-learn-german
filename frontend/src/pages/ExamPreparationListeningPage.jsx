import { Link } from "react-router-dom";
import { LISTENING_TYPES } from "./examPreparationTypeContent.js";
import "./ExamPreparationListeningPage.css";

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
            完整训练 telc B1 听力的三个部分，在规定播放次数内捕捉日常对话、访谈和公共广播中的关键信息。
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
