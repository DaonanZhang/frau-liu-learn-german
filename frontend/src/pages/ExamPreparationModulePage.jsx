import { Link } from "react-router-dom";
import "./ExamPreparationModulePage.css";

const SKILL_CARDS = [
  {
    key: "listening",
    title: "Hören",
    label: "听力专项",
    description: "适合集中训练日常听力、关键信息捕捉与题目判断。你可以在这里按照不同题型进入练习，逐步熟悉考试节奏。",
    to: "/modules/exam-preparation/hoeren",
    cta: "进入听力模块",
    progress: "听音理解",
  },
  {
    key: "reading",
    title: "Lesen",
    label: "阅读专项",
    description: "围绕文章理解、标题匹配与信息查找展开训练，帮助你更快抓住段落重点，提高做题速度与准确度。",
    to: "/modules/exam-preparation/lesen",
    cta: "进入阅读模块",
    progress: "文章理解",
  },
  {
    key: "sprachbausteine",
    title: "Sprachbausteine",
    label: "语法专项",
    description: "聚焦词汇、语法和句子结构的综合运用，适合系统巩固常见语法点，提升填空和搭配判断能力。",
    to: "/modules/exam-preparation/sprachbausteine",
    cta: "进入 Sprachbausteine",
    progress: "词汇语法",
  },
  {
    key: "writing",
    title: "Schreiben",
    label: "写作专项",
    description: "从题目要求、写作结构到表达组织，帮助你逐步建立写作思路，学会在考试中更清晰地完成书面表达。",
    to: "/modules/exam-preparation/schreiben",
    cta: "进入 Schreiben",
    progress: "书面表达",
  },
  {
    key: "speaking",
    title: "Sprechen",
    label: "口语专项",
    description: "练习口头表达、场景应答与观点组织，帮助你在考试中更自然地开口，更完整地表达自己的想法。",
    to: "/modules/exam-preparation/sprechen",
    cta: "进入 Sprechen",
    progress: "口头表达",
  },
];

export default function ExamPreparationModulePage() {
  return (
    <div className="exam-module-page">
      <section className="exam-module-hero">
        <div className="exam-module-hero__content">
          <p className="exam-module-hero__eyebrow">考试专项训练</p>
          <h1 className="exam-module-hero__title">备考季</h1>
          <p className="exam-module-hero__copy">
            在这里，你可以按专项进入练习，针对考试中最常见的听、说、读、写与语法任务进行集中训练。每个入口都对应不同能力方向，方便你根据自己的薄弱环节安排复习。
          </p>
          <div className="exam-module-hero__tags" aria-label="模块特点">
            <span className="exam-module-hero__tag">专项练习</span>
            <span className="exam-module-hero__tag">按能力分类</span>
            <span className="exam-module-hero__tag">适合考前复习</span>
          </div>
        </div>
      </section>

      <section className="exam-module-grid" aria-label="专项入口列表">
        {SKILL_CARDS.map((card) => {
          const content = (
            <>
              <div className="exam-module-card__header">
                <div className="exam-module-card__meta">
                  <span className="exam-module-card__kicker">{card.label}</span>
                  <span className="exam-module-card__progress">{card.progress}</span>
                </div>
                <div className="exam-module-card__title-row">
                  <h2 className="exam-module-card__title">{card.title}</h2>
                </div>
              </div>
              <p className="exam-module-card__description">{card.description}</p>
              <div className="exam-module-card__footer">
                {card.to ? (
                  <span className="exam-module-card__cta">{card.cta || "进入"}</span>
                ) : (
                  <span className="exam-module-card__badge">即将开放</span>
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
