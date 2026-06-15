import { Link } from "react-router-dom";
import "./ExamPreparationReadingPage.css";

const READING_TYPES = [
  {
    key: "title-matching",
    title: "READING_TITLE_MATCHING",
    label: "Titel zuordnen",
    description: "先读 5 段文本，再为每段文本匹配一个最合适的标题。",
    to: "/modules/exam-preparation/lesen/title-matching",
    cta: "进入第一题型",
  },
  {
    key: "understanding",
    title: "READING_UNDERSTANDING",
    label: "Leseverstehen",
    description: "先读一段文章，再完成下面每一道 a、b、c 单选题。",
    to: "/modules/exam-preparation/lesen/understanding",
    cta: "进入第二题型",
  },
  {
    key: "ad-matching",
    title: "READING_AD_MATCHING",
    label: "Anzeige zuordnen",
    description: "阅读 10 条情况描述，再从 a-l 或 X 中找到最合适的一则 Anzeige。",
    to: "/modules/exam-preparation/lesen/ad-matching",
    cta: "进入第三题型",
  },
];

export default function ExamPreparationReadingPage() {
  return (
    <div className="exam-reading-page">
      <div className="exam-reading-topbar">
        <Link to="/modules/exam-preparation" className="exam-reading-topbar__back">
          ← Zurück zu Exam Preparation
        </Link>
      </div>

      <section className="exam-reading-hero">
        <div>
          <p className="exam-reading-hero__eyebrow">Lesen</p>
          <h1 className="exam-reading-hero__title">阅读模块</h1>
          <p className="exam-reading-hero__copy">
            这里先拆成三种阅读题型。当前只把第一种标题匹配题做成可联调、可浏览、可点选的页面。
          </p>
        </div>
      </section>

      <section className="exam-reading-type-grid">
        {READING_TYPES.map((item) => {
          const content = (
            <>
              <div className="exam-reading-type__top">
                <span className="exam-reading-type__mono">{item.title}</span>
                <h2 className="exam-reading-type__title">{item.label}</h2>
              </div>
              <p className="exam-reading-type__description">{item.description}</p>
              <div className="exam-reading-type__bottom">
                {item.to ? (
                  <span className="exam-reading-type__cta">{item.cta}</span>
                ) : (
                  <span className="exam-reading-type__soon">Coming soon</span>
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
