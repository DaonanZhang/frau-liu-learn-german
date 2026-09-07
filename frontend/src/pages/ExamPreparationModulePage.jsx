import { Link } from "react-router-dom";
import { useAuth } from "../api/auth/useAuth.js";
import { EXAM_PREPARATION_MODULE } from "./Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";
import "./ExamPreparationModulePage.css";

const SKILL_CARDS = [
  {
    key: "listening",
    title: "Hören",
    label: "听力专项",
    description: "通过日常短对话、访谈和公共广播三类任务，训练一次或两次播放条件下的正误判断，共覆盖 20 道判断题。",
    to: "/modules/exam-preparation/hoeren",
    cta: "进入听力模块",
    progress: "听音理解",
  },
  {
    key: "reading",
    title: "Lesen",
    label: "阅读专项",
    description: "训练短文本与标题匹配、长文单选和生活情境与分类广告匹配，完整覆盖 telc B1 阅读三大题型。",
    to: "/modules/exam-preparation/lesen",
    cta: "进入阅读模块",
    progress: "文章理解",
  },
  {
    key: "sprachbausteine",
    title: "Sprachbausteine",
    label: "语法专项",
    description: "通过短文语法选择和备选词填空，集中考察语法结构、词汇搭配与上下文理解，共完成 20 个空格。",
    to: "/modules/exam-preparation/sprachbausteine",
    cta: "进入 Sprachbausteine",
    progress: "词汇语法",
  },
  {
    key: "writing",
    title: "Schreiben",
    label: "写作专项",
    description: "在 30 分钟内根据来信完成回复邮件，覆盖全部 4 个提示要点，并练习书信格式、恰当语体与逻辑衔接。",
    to: "/modules/exam-preparation/schreiben",
    cta: "进入 Schreiben",
    progress: "书面表达",
  },
  {
    key: "speaking",
    title: "Sprechen",
    label: "口语专项",
    description: "通过互相认识、主题讨论和共同策划三部分训练，在真实搭档任务中练习提问、表达观点、协商与达成一致。",
    to: "/modules/exam-preparation/sprechen",
    cta: "进入 Sprechen",
    progress: "口头表达",
  },
];

export default function ExamPreparationModulePage() {
  const { user } = useAuth();
  const hasFullAccess = hasModuleAccess(user, EXAM_PREPARATION_MODULE);
  const currentExpiry = (Array.isArray(user?.entitlements) ? user.entitlements : [])
    .filter((item) => item?.module?.key === "exam_preparation" && item?.status === "active" && item?.expires_at)
    .map((item) => new Date(item.expires_at))
    .filter((item) => !Number.isNaN(item.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return (
    <div className="exam-module-page">
      <section className="exam-module-hero">
        <div className="exam-module-hero__content">
          <h1 className="exam-module-hero__title">备考季</h1>
          <p className="exam-module-hero__copy">
            <strong>“源于真题，高于真题”</strong>——我们的题库由符号刘博士团队精心打磨，紧扣官方大纲。用真题和模拟题复刻考试难度与命题规律，让你在考场上游刃有余、拒绝慌乱。
          </p>
          <div className="exam-module-hero__tags" aria-label="核心功能亮点">
            <span className="exam-module-hero__tag">沉浸式交互学习</span>
            <span className="exam-module-hero__tag">保姆级答案详解</span>
            <span className="exam-module-hero__tag">听说读写全维突破</span>
            <span className="exam-module-hero__tag">智能错题集与复习闭环</span>
          </div>
          <p className="exam-module-hero__notice">
            {EXAM_PREPARATION_MODULE.purchaseNotice}
          </p>
          <div className="exam-module-hero__access">
            <span>
              {hasFullAccess
                ? `当前权限有效至：${currentExpiry
                  ? new Intl.DateTimeFormat("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(currentExpiry)
                  : "长期有效"}`
                : "当前为免费试用：每个题型开放前 3 道题"}
            </span>
            <Link to="/modules/exam-preparation/purchase">
              {hasFullAccess ? "延长有效期" : "解锁全部题目"}
            </Link>
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
