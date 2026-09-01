import { Link } from "react-router-dom";
import "./ExamPreparationSpeakingPage.css";

const SPEAKING_TYPES = [
  {
    key: "teil1",
    title: "Teil 1",
    description: "围绕姓名、 Herkunft、居住、家庭、学习德语、职业和语言等信息与搭档互相了解。",
    to: "/modules/exam-preparation/sprechen/teil-1",
    cta: "进入这一题型",
  },
  {
    key: "teil2",
    title: "Teil 2",
    description: "先复述自己的文章内容，再介绍搭档的相反观点，最后交换意见并谈个人经验。",
    to: "/modules/exam-preparation/sprechen/teil-2",
    cta: "进入这一题型",
  },
  {
    key: "teil3",
    title: "Teil 3",
    description: "和搭档交换想法、讨论任务安排，最终就时间、地点、费用和分工等事项达成一致。",
    to: "/modules/exam-preparation/sprechen/teil-3",
    cta: "进入这一题型",
  },
];

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
            这里按照 telc B1 Sprechen 的 Teil 1、Teil 2 和 Teil 3 训练真实口语任务：互相了解、围绕主题讨论，以及共同制定计划。
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
