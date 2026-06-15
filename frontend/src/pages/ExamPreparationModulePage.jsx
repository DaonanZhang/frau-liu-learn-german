import { Link } from "react-router-dom";
import "./ExamPreparationModulePage.css";

const SKILL_CARDS = [
  {
    key: "listening",
    title: "Hören",
    subtitle: "Listening",
    description: "听力模块按题型拆分入口，统一保留说明、播放器、Aufgaben 与 Prüfen 流程。",
    to: "/modules/exam-preparation/hoeren",
    cta: "进入听力模块",
  },
  {
    key: "reading",
    title: "Lesen",
    subtitle: "Reading",
    description: "当前优先实现阅读模块，先完成标题匹配题型，再继续扩展其余两种阅读题。",
    to: "/modules/exam-preparation/lesen",
    cta: "进入阅读模块",
  },
  {
    key: "sprachbausteine",
    title: "Sprachbausteine",
    subtitle: "Grammar & Cloze",
    description: "语法填空与共享选项池题型会从这里进入，后续可继续拆成两个专项题型。",
    to: "/modules/exam-preparation/sprachbausteine",
    cta: "进入 Sprachbausteine",
  },
  {
    key: "writing",
    title: "Schreiben",
    subtitle: "Writing",
    description: "写作任务页和示例答案页之后会从这里进入。",
    to: "/modules/exam-preparation/schreiben",
    cta: "进入 Schreiben",
  },
  {
    key: "speaking",
    title: "Sprechen",
    subtitle: "Speaking",
    description: "口语配段落和其余口语练习会放在这里。",
    state: "coming-soon",
  },
];

export default function ExamPreparationModulePage() {
  return (
    <div className="exam-module-page">
      <section className="exam-module-hero">
        <div className="exam-module-hero__content">
          <p className="exam-module-hero__eyebrow">Exam Preparation Season</p>
          <h1 className="exam-module-hero__title">备考季</h1>
          <p className="exam-module-hero__copy">
            这是一个独立于视频课程的考试专项模块。当前先打通阅读模块，从题型数据结构、接口联调到页面呈现逐步搭建。
          </p>
        </div>
      </section>

      <section className="exam-module-grid" aria-label="exam skills">
        {SKILL_CARDS.map((card) => {
          const content = (
            <>
              <div className="exam-module-card__header">
                <span className="exam-module-card__kicker">{card.subtitle}</span>
                <h2 className="exam-module-card__title">{card.title}</h2>
              </div>
              <p className="exam-module-card__description">{card.description}</p>
              <div className="exam-module-card__footer">
                {card.to ? (
                  <span className="exam-module-card__cta">{card.cta || "进入"}</span>
                ) : (
                  <span className="exam-module-card__badge">Coming soon</span>
                )}
              </div>
            </>
          );

          if (card.to) {
            return (
              <Link key={card.key} to={card.to} className="exam-module-card exam-module-card--link">
                {content}
              </Link>
            );
          }

          return (
            <article key={card.key} className="exam-module-card exam-module-card--muted">
              {content}
            </article>
          );
        })}
      </section>
    </div>
  );
}
