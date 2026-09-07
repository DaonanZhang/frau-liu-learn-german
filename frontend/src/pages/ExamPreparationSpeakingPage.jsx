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
            准备时间 20 分钟：在单独的准备室可使用空白纸张做笔记，但不能使用手机或词典。随后完成互相认识、主题讨论和共同策划三个部分。
          </p>
          <div className="exam-speaking-hero__tags" aria-label="口语模块特点">
            <span className="exam-speaking-hero__tag">口头表达训练</span>
            <span className="exam-speaking-hero__tag">提升组织能力</span>
            <span className="exam-speaking-hero__tag">适合考前强化</span>
          </div>
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
