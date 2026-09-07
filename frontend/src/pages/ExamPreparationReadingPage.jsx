import { Link } from "react-router-dom";
import { READING_TYPES } from "./examPreparationTypeContent.js";
import "./ExamPreparationReadingPage.css";

export default function ExamPreparationReadingPage() {
  return (
    <div className="exam-reading-page">
      <div className="exam-reading-topbar">
        <Link to="/modules/exam-preparation" className="exam-reading-topbar__back">
          ← 返回备考季
        </Link>
      </div>

      <section className="exam-reading-hero">
        <div>
          <p className="exam-reading-hero__eyebrow">Lesen</p>
          <h1 className="exam-reading-hero__title">阅读模块</h1>
          <p className="exam-reading-hero__copy">
            完整训练 telc B1 阅读的三个部分：短文本标题匹配、长文理解选择，以及生活情境与分类广告匹配。
          </p>
        </div>
      </section>

      <section className="exam-reading-type-grid" aria-label="阅读题型列表">
        {READING_TYPES.map((item) => {
          const content = (
            <>
              <div className="exam-reading-type__top">
                <h2 className="exam-reading-type__title">{item.title}</h2>
              </div>
              <p className="exam-reading-type__description">{item.description}</p>
              <div className="exam-reading-type__bottom">
                {item.to ? (
                  <span className="exam-reading-type__cta">{item.cta}</span>
                ) : (
                  <span className="exam-reading-type__soon">即将开放</span>
                )}
              </div>
            </>
          );

          if (item.to) {
            return (
              <Link key={item.key} to={item.to} className="exam-reading-type exam-reading-type--link">
                {content}
              </Link>
            );
          }

          return (
            <article key={item.key} className="exam-reading-type exam-reading-type--muted">
              {content}
            </article>
          );
        })}
      </section>
    </div>
  );
}
