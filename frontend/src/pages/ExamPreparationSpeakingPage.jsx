import { Link } from "react-router-dom";
import { SPEAKING_TYPES } from "./examPreparationTypeContent.js";
import "./ExamPreparationSpeakingPage.css";

export default function ExamPreparationSpeakingPage() {
  return (
    <div className="exam-speaking-page">
      <div className="exam-speaking-topbar">
        <Link to="/modules/exam-preparation" className="exam-speaking-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-speaking-hero">
        <div>
          <p className="exam-speaking-hero__eyebrow">Sprechen</p>
          <h1 className="exam-speaking-hero__title">口语模块</h1>
          <p className="exam-speaking-hero__copy">
            Vorbereitungszeit: 20 Min. 在单独的准备室，可查阅空白纸张做笔记，但不能使用手机或词典。
          </p>
          <p className="exam-speaking-hero__copy">
            随后完成互相认识、主题讨论和共同策划三个部分。
          </p>
        </div>
      </section>

      <section className="exam-speaking-type-grid" aria-label="口语题型列表">
        {SPEAKING_TYPES.map((item) => (
          <Link key={item.key} to={item.to} className="exam-speaking-type exam-speaking-type--link">
            <div className="exam-speaking-type__top">
              <h2 className="exam-speaking-type__title">{item.title}</h2>
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
