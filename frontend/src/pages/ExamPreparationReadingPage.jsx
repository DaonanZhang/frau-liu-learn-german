import { Link } from "react-router-dom";
import "./ExamPreparationReadingPage.css";

const READING_TYPES = [
  {
    key: "title-matching",
    title: "Teil 1",
    description: "适合训练快速概括段落大意的能力。你需要抓住每一段的核心信息，再从多个标题中选出最合适的一项。",
    to: "/modules/exam-preparation/lesen/title-matching",
    cta: "进入这一题型",
  },
  {
    key: "understanding",
    title: "Teil 2",
    description: "围绕一篇完整文章进行练习，更适合提升细节理解、语境判断和信息定位能力，帮助你更稳地完成阅读选择题。",
    to: "/modules/exam-preparation/lesen/understanding",
    cta: "进入这一题型",
  },
  {
    key: "ad-matching",
    title: "Teil 3",
    description: "通过对比条件与信息内容完成匹配，适合训练筛选关键词、判断需求重点和快速查找相关信息的能力。",
    to: "/modules/exam-preparation/lesen/ad-matching",
    cta: "进入这一题型",
  },
];

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
            这里提供不同方向的阅读训练。你可以根据自己的复习目标，选择练习概括主旨、理解文章细节，或者完成需求与信息之间的匹配。
          </p>
          <div className="exam-reading-hero__tags" aria-label="阅读模块特点">
            <span className="exam-reading-hero__tag">按题型练习</span>
            <span className="exam-reading-hero__tag">提升阅读速度</span>
            <span className="exam-reading-hero__tag">强化理解与判断</span>
          </div>
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
