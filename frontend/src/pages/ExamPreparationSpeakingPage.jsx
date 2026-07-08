import { Link } from "react-router-dom";
import "./ExamPreparationSpeakingPage.css";

const SPEAKING_TYPES = [
  {
    key: "gap-matching",
    title: "句子匹配",
    label: "根据语境补全表达",
    description: "通过补全对话或口语文本中的空缺内容，练习在语境里选择更自然的表达方式，帮助你强化口语结构和句子衔接。",
    to: "/modules/exam-preparation/sprechen/gap-matching",
    cta: "进入这一题型",
    focus: "表达衔接",
  },
  {
    key: "prompt-segmented",
    title: "段落组织",
    label: "整理表达顺序与结构",
    description: "围绕口语题目整理表达内容的先后顺序，更适合训练开头、展开和结尾之间的逻辑组织，让回答更完整、更有条理。",
    to: "/modules/exam-preparation/sprechen/prompt-segmented",
    cta: "进入这一题型",
    focus: "组织表达",
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
            这里的练习重点放在开口表达、句子组织和回答结构上。你可以根据自己的需要，选择练习语境补全，或者训练完整表达的组织能力。
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
              <div className="exam-speaking-type__meta">
                <span className="exam-speaking-type__mono">{item.title}</span>
                <span className="exam-speaking-type__focus">{item.focus}</span>
              </div>
              <h2 className="exam-speaking-type__title">{item.label}</h2>
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
