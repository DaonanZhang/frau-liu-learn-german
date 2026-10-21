import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { useAuth } from "../api/auth/useAuth.js";
import { EXAM_PREPARATION_MODULE } from "./Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";
import {
  activeMockExamKey,
  mockExamSessionKey,
  deleteSavedMockExam,
  fetchSavedMockExams,
} from "../api/exam_preparation/mockExams.js";
import { clearAnnotationScope, mockAnnotationScope } from "../utils/examTextAnnotations.js";
import ExamPreparationContentSearch from "../components/examPreparation/ExamPreparationContentSearch.jsx";
import "./ExamPreparationModulePage.css";
import { examPreparationPurchasePath, examPreparationScope } from "../utils/examPreparationScope.js";

const SKILL_CARDS = [
  {
    key: "listening",
    title: "Hören",
    label: "听力专项",
    description: "通过日常短对话、访谈和公共广播三类任务，训练在规定播放次数内判断关键信息。",
    to: "/modules/exam-preparation/hoeren",
    cta: "进入听力模块",
    progress: "听音理解",
  },
  {
    key: "reading",
    title: "Lesen",
    label: "阅读专项",
    description: "训练短文本与标题匹配、长文单选和生活情境与分类广告匹配。",
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
    descriptionByLevel: {
      B2: "通过主题展示、主题讨论和共同策划三部分训练，在真实搭档任务中练习提问、表达观点、协商与达成一致。",
    },
    to: "/modules/exam-preparation/sprechen",
    cta: "进入 Sprechen",
    progress: "口头表达",
  },
];

const MOCK_PHASE_LABELS = { reading: "阅读与语言模块", collection: "第一部分收卷", listening: "听力", writing: "写作", writing_review: "写作自评" };

export default function ExamPreparationModulePage({ level: levelProp } = {}) {
  const { level: routeLevel } = useParams();
  const levelParam = routeLevel || levelProp;
  const scope = examPreparationScope(levelParam);
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasFullAccess = hasModuleAccess(user, EXAM_PREPARATION_MODULE);
  const activeAttemptKey = activeMockExamKey(user?.id, scope || examPreparationScope("B1"));
  const sessionKey = mockExamSessionKey(user?.id, scope || examPreparationScope("B1"));
  const [activeMockExams, setActiveMockExams] = useState([]);
  const [activeMockExamCount, setActiveMockExamCount] = useState(0);
  const [recordPending, setRecordPending] = useState(null);
  const currentExpiry = (Array.isArray(user?.entitlements) ? user.entitlements : [])
    .filter((item) => item?.module?.key === "exam_preparation" && item?.status === "active" && item?.expires_at)
    .map((item) => new Date(item.expires_at))
    .filter((item) => !Number.isNaN(item.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  useEffect(() => {
    if (!scope || !hasFullAccess) return undefined;
    let cancelled = false;
    fetchSavedMockExams("active", 1, 3, scope)
      .then((data) => {
        if (cancelled) return;
        setActiveMockExams(Array.isArray(data?.results) ? data.results : []);
        setActiveMockExamCount(Number(data?.count) || 0);
      })
      .catch(() => {
        if (!cancelled) {
          setActiveMockExams([]);
          setActiveMockExamCount(0);
        }
      });
    return () => { cancelled = true; };
  }, [hasFullAccess, scope?.level]);

  async function removeInterruptedExam(record) {
    const result = await Swal.fire({
      icon: "warning", title: "删除这条考试记录？", text: "试卷、答案和考试进度都会被永久删除。",
      confirmButtonText: "删除", confirmButtonColor: "#b84f46", showCancelButton: true, cancelButtonText: "取消",
    });
    if (!result.isConfirmed) return;
    setRecordPending(record.id);
    try {
      await deleteSavedMockExam(record.id);
      clearAnnotationScope(mockAnnotationScope(record.id));
      const recordScope = examPreparationScope(record.level) || scope;
      const paperScope = { ...recordScope, examType: String(record.exam_type || "TELC").toUpperCase() };
      const recordActiveKey = activeMockExamKey(user?.id, paperScope);
      const recordSessionKey = mockExamSessionKey(user?.id, paperScope);
      if (localStorage.getItem(recordActiveKey) === String(record.id)) {
        localStorage.removeItem(recordActiveKey);
        localStorage.removeItem(recordSessionKey);
        sessionStorage.removeItem(recordSessionKey);
      }
      setActiveMockExams((items) => items.filter((item) => item.id !== record.id));
      setActiveMockExamCount((count) => Math.max(0, count - 1));
    } catch (error) {
      await Swal.fire({ icon: "error", title: "删除失败", text: error?.data?.message || "请稍后重试。" });
    } finally { setRecordPending(null); }
  }

  async function openMockExam() {
    if (hasFullAccess) {
      const previousAttemptId = localStorage.getItem(activeAttemptKey);
      if (previousAttemptId) {
        clearAnnotationScope(mockAnnotationScope(previousAttemptId));
      }
      sessionStorage.removeItem(sessionKey);
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(activeAttemptKey);
      navigate(`/modules/exam-preparation/${scope.examType.toLowerCase()}/${scope.levelPath}/mock-exam`);
      return;
    }
    const result = await Swal.fire({
      icon: "info",
      title: "购买备考季以解锁笔试模拟",
      text: "购买备考季后可参加完整模拟考试并查看考试记录。",
      confirmButtonText: "购买以解锁",
      showCancelButton: true,
      cancelButtonText: "暂不购买",
      customClass: {
        popup: "exam-module-mock-modal",
        confirmButton: "exam-module-mock-modal__confirm",
      },
    });
    if (result.isConfirmed) {
      navigate(examPreparationPurchasePath(scope));
    }
  }

  function continueLatestMockExam() {
    const latestAttempt = activeMockExams[0];
    if (!latestAttempt) return;
    const recordScope = examPreparationScope(latestAttempt.level) || scope;
    const paperScope = { ...recordScope, examType: String(latestAttempt.exam_type || "TELC").toUpperCase() };
    const recordSessionKey = mockExamSessionKey(user?.id, paperScope);
    sessionStorage.removeItem(recordSessionKey);
    localStorage.removeItem(recordSessionKey);
    localStorage.setItem(activeMockExamKey(user?.id, paperScope), String(latestAttempt.id));
    navigate(`/modules/exam-preparation/${paperScope.examType.toLowerCase()}/${paperScope.levelPath}/mock-exam?attempt=${latestAttempt.id}`);
  }

  if (!levelParam) {
    return (
      <section className="exam-level-selection" aria-labelledby="exam-level-selection-title">
        <h1 id="exam-level-selection-title">选择考试级别</h1>
        <div className="exam-level-selection__grid">
          {["B1", "B2"].map((level) => (
            <Link
              key={level}
              className={`exam-level-selection__card exam-level-selection__card--${level.toLowerCase()}`}
              to={`/modules/exam-preparation/${level.toLowerCase()}`}
              onClick={(event) => {
                if (level === "B2" && String(user?.telephone || "").trim() !== "110") {
                  event.preventDefault();
                  Swal.fire({ icon: "info", title: "Coming soon" });
                }
              }}
            >
              <span className="exam-level-selection__title">TELC {level}</span>
              <span className="exam-level-selection__action">
                进入备考季 <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    );
  }
  if (!scope) return <Navigate to="/modules/exam-preparation" replace />;

  return (
    <div className="exam-module-page" data-exam-level={scope.level}>
      <Link className="exam-module-page__back" to="/modules/exam-preparation">
        ← 返回级别选择
      </Link>
      <section className="exam-module-hero">
        <div className="exam-module-hero__content">
          <h1 className="exam-module-hero__title">备考季 · {scope.level}</h1>
          <p className="exam-module-hero__copy">
            {EXAM_PREPARATION_MODULE.description}
          </p>
          <div className="exam-module-hero__tags" aria-label="核心功能亮点">
            <span className="exam-module-hero__tag">真题与模拟题</span>
            <span className="exam-module-hero__tag">答案解析</span>
            <span className="exam-module-hero__tag">听说读写</span>
            <span className="exam-module-hero__tag">错题与收藏</span>
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
            <Link to={examPreparationPurchasePath(scope)}>
              {hasFullAccess ? "延长有效期" : "解锁全部题目"}
            </Link>
          </div>
        </div>
      </section>

      {String(user?.telephone || "").trim() === "110" ? (
        <ExamPreparationContentSearch scope={scope} />
      ) : null}

      <section className={`exam-module-mock${hasFullAccess ? "" : " is-locked"}`} aria-label="笔试模拟考试">
        <div className="exam-module-mock__icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <path d="M11 7.5h20a4 4 0 0 1 4 4v12.25" />
            <path d="M11 7.5a4 4 0 0 0-4 4v25a4 4 0 0 0 4 4h16.5" />
            <path d="M15 16h12M15 23h8M15 30h6" />
            <circle cx="34" cy="34" r="9" />
            <path d="M34 29v5l3.5 2" />
          </svg>
        </div>
        <div className="exam-module-mock__content">
          <h2>笔试模拟</h2>
          <p>按正式考试流程完成一套笔试，检验时间分配和答题情况。</p>
          <div className="exam-module-mock__actions">
            {hasFullAccess && activeMockExams.length ? (
              <button type="button" onClick={continueLatestMockExam} className="exam-module-mock__button is-secondary">继续考试</button>
            ) : null}
            <button type="button" onClick={openMockExam} className="exam-module-mock__button">
              {hasFullAccess ? "开始新考试" : "🔒 购买以解锁"}
            </button>
          </div>
        </div>
      </section>

      {hasFullAccess && activeMockExams.length ? (
        <section className="exam-module-interrupted" aria-label="未完成的模拟考试">
          <div className="exam-module-interrupted__heading"><h2>未完成的模拟考试</h2>{activeMockExamCount > 3 ? <Link to={`/modules/exam-preparation/${scope.examType.toLowerCase()}/${scope.levelPath}/mock-exams`}>查看更多未完成考试</Link> : null}</div>
          <div className="exam-module-interrupted__list">
            {activeMockExams.map((record) => (
              <article key={record.id} className="exam-module-interrupted__card">
                <div><strong>{String(record.exam_type || "TELC").toUpperCase()} {String(record.level || scope.level).toUpperCase()} · {MOCK_PHASE_LABELS[record.progress?.phase] || "阅读与语言模块"}</strong><small>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.updated_at))}</small></div>
                <div><button onClick={() => {
                  const recordScope = examPreparationScope(record.level) || scope;
                  const paperScope = { ...recordScope, examType: String(record.exam_type || "TELC").toUpperCase() };
                  navigate(`/modules/exam-preparation/${paperScope.examType.toLowerCase()}/${paperScope.levelPath}/mock-exam?attempt=${record.id}`);
                }}>继续考试</button><button className="is-danger" disabled={recordPending === record.id} onClick={() => removeInterruptedExam(record)}>删除</button></div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
              <p className="exam-module-card__description">
                {card.descriptionByLevel?.[scope.level] || card.description}
              </p>
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
              <Link key={card.key} to={card.to.replace("/modules/exam-preparation/", `/modules/exam-preparation/${scope.levelPath}/`)} className="exam-module-card exam-module-card--link">
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
