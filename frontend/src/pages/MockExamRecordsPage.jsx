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
  retakeSavedMockExam,
  updateSavedMockExam,
} from "../api/exam_preparation/mockExams.js";
import { clearAnnotationScope, mockAnnotationScope } from "../utils/examTextAnnotations.js";
import { examPreparationPurchasePath, examPreparationScope } from "../utils/examPreparationScope.js";
import "./MockExamRecordsPage.css";

const PHASE_LABELS = {
  reading: "阅读与语言模块",
  collection: "第一部分收卷",
  listening: "听力",
  writing: "写作",
  writing_review: "写作自评",
};

function formatUpdatedAt(value) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCompletedResult(record) {
  const score = Number(record.total_score || 0);
  const formattedScore = Number.isInteger(score) ? String(score) : String(score).replace(/0+$/, "").replace(/\.$/, "");
  return `已完成 · ${formattedScore} / 225 · ${Number(record.score_percentage || 0).toFixed(1)}% · ${record.is_passed ? "通过" : "未通过"}`;
}

export default function MockExamRecordsPage() {
  const { examType: routeExamType, level: routeLevel } = useParams();
  const scope = examPreparationScope(routeLevel) || examPreparationScope("B1");
  const supportsRoute = String(routeExamType || scope.examType).toUpperCase() === scope.examType;
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasFullAccess = hasModuleAccess(user, EXAM_PREPARATION_MODULE);
  const levelHomePath = `/modules/exam-preparation/${scope.levelPath}`;
  const [records, setRecords] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [recordCount, setRecordCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [favoritePage, setFavoritePage] = useState(1);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(hasFullAccess && supportsRoute);
  const [pendingId, setPendingId] = useState(null);
  const [errorText, setErrorText] = useState("");
  const [activeTab, setActiveTab] = useState("records");

  useEffect(() => {
    if (!supportsRoute || !hasFullAccess) return undefined;
    let cancelled = false;
    setLoading(true);
    const listScope = activeTab === "favorites" ? "favorites" : "history";
    const page = activeTab === "favorites" ? favoritePage : recordPage;
    fetchSavedMockExams(listScope, page, 10, scope)
      .then((data) => {
        if (cancelled) return;
        const results = Array.isArray(data?.results) ? data.results : [];
        if (activeTab === "favorites") {
          setFavorites(results);
          setFavoriteCount(Number(data?.count) || 0);
        } else {
          setRecords(results);
          setRecordCount(Number(data?.count) || 0);
        }
        setHasPreviousPage(Boolean(data?.previous));
        setHasNextPage(Boolean(data?.next));
        setErrorText("");
      })
      .catch((error) => { if (!cancelled) setErrorText(error?.data?.message || "考试记录加载失败，请稍后重试。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supportsRoute, hasFullAccess, activeTab, recordPage, favoritePage, scope.level]);

  function clearLocalAttempt(recordId) {
    const record = [...records, ...favorites].find((item) => item.id === recordId);
    const recordScope = record ? examPreparationScope(record.level) : scope;
    const recordActiveKey = activeMockExamKey(user?.id, { ...recordScope, examType: String(record?.exam_type || "TELC").toUpperCase() });
    const recordSessionKey = mockExamSessionKey(user?.id, { ...recordScope, examType: String(record?.exam_type || "TELC").toUpperCase() });
    if (localStorage.getItem(recordActiveKey) !== String(recordId)) return;
    localStorage.removeItem(recordActiveKey);
    localStorage.removeItem(recordSessionKey);
    sessionStorage.removeItem(recordSessionKey);
  }

  async function removeRecord(record) {
    const result = await Swal.fire({
      icon: "warning", title: "删除这条考试记录？", text: "试卷、答案和考试进度都会被永久删除。",
      confirmButtonText: "删除", confirmButtonColor: "#b84f46", showCancelButton: true, cancelButtonText: "取消",
    });
    if (!result.isConfirmed) return;
    setPendingId(record.id);
    try {
      await deleteSavedMockExam(record.id);
      clearAnnotationScope(mockAnnotationScope(record.id));
      clearLocalAttempt(record.id);
      setRecords((items) => items.filter((item) => item.id !== record.id));
      setFavorites((items) => items.filter((item) => item.id !== record.id));
      setRecordCount((count) => Math.max(0, count - 1));
      if (record.is_favorite) setFavoriteCount((count) => Math.max(0, count - 1));
    } catch (error) {
      await Swal.fire({ icon: "error", title: "删除失败", text: error?.data?.message || "请稍后重试。" });
    } finally { setPendingId(null); }
  }

  async function toggleFavorite(record) {
    if (!record.is_completed) return;
    setPendingId(record.id);
    try {
      const updated = await updateSavedMockExam(record.id, { is_favorite: !record.is_favorite });
      setRecords((items) => items.map((item) => item.id === updated.id ? updated : item));
      setFavorites((items) => updated.is_favorite
        ? [updated, ...items.filter((item) => item.id !== updated.id)]
        : items.filter((item) => item.id !== updated.id));
      setFavoriteCount((count) => Math.max(0, count + (updated.is_favorite ? 1 : -1)));
    } catch (error) {
      await Swal.fire({ icon: "error", title: "操作失败", text: error?.data?.message || "请稍后重试。" });
    } finally { setPendingId(null); }
  }

  async function retake(record) {
    setPendingId(record.id);
    try {
      const attempt = await retakeSavedMockExam(record.id);
      const recordScope = examPreparationScope(attempt.level || record.level) || scope;
      const paperScope = { ...recordScope, examType: String(attempt.exam_type || record.exam_type || "TELC").toUpperCase() };
      const paperSessionKey = mockExamSessionKey(user?.id, paperScope);
      sessionStorage.removeItem(paperSessionKey);
      localStorage.removeItem(paperSessionKey);
      localStorage.setItem(activeMockExamKey(user?.id, paperScope), String(attempt.id));
      navigate(`/modules/exam-preparation/${paperScope.examType.toLowerCase()}/${paperScope.levelPath}/mock-exam?attempt=${attempt.id}`);
    } catch (error) {
      await Swal.fire({ icon: "error", title: "暂时无法重考", text: error?.data?.message || "请稍后重试。" });
    } finally { setPendingId(null); }
  }

  function actionButtons(record) {
    const recordScope = examPreparationScope(record.level) || scope;
    const paperScope = { ...recordScope, examType: String(record.exam_type || "TELC").toUpperCase() };
    return (
      <div className="mock-records-actions">
        <button onClick={() => navigate(`/modules/exam-preparation/${paperScope.examType.toLowerCase()}/${paperScope.levelPath}/mock-exam?${record.is_completed ? "saved" : "attempt"}=${record.id}`)}>
          {record.is_completed ? "查看结果" : "继续考试"}
        </button>
        {record.is_completed ? <button disabled={pendingId === record.id} onClick={() => toggleFavorite(record)}>{record.is_favorite ? "取消收藏" : "收藏"}</button> : null}
        {record.is_completed ? <button disabled={pendingId === record.id} onClick={() => retake(record)}>重考</button> : null}
        <button className="is-danger" disabled={pendingId === record.id} onClick={() => removeRecord(record)}>删除</button>
      </div>
    );
  }

  if (!supportsRoute) {
    return <Navigate to="/modules/exam-preparation" replace />;
  }

  if (!hasFullAccess) {
    return <div className="mock-records-page"><Link className="mock-records-back" to={levelHomePath}>← 返回备考季</Link><section className="mock-records-empty"><h1>模拟考试记录</h1><p>购买备考季后可查看考试记录和收藏试卷。</p><Link to={examPreparationPurchasePath(scope)}>购买以解锁</Link></section></div>;
  }

  const visibleRecords = activeTab === "favorites" ? favorites : records;
  const visibleCount = activeTab === "favorites" ? favoriteCount : recordCount;
  const visiblePage = activeTab === "favorites" ? favoritePage : recordPage;

  function changePage(nextPage) {
    if (activeTab === "favorites") setFavoritePage(nextPage);
    else setRecordPage(nextPage);
  }

  return (
    <div className="mock-records-page">
      <header className="mock-records-hero">
        <Link className="mock-records-back" to={levelHomePath}>← 返回备考季</Link>
        <h1>模拟考试记录</h1>
      </header>
      <div className="mock-records-tabs" role="tablist" aria-label="模拟考试记录分类">
        <button type="button" role="tab" aria-selected={activeTab === "records"} className={activeTab === "records" ? "is-active" : ""} onClick={() => setActiveTab("records")}>考试记录</button>
        <button type="button" role="tab" aria-selected={activeTab === "favorites"} className={activeTab === "favorites" ? "is-active" : ""} onClick={() => setActiveTab("favorites")}>收藏试卷</button>
      </div>
      {errorText ? <p className="mock-records-error">{errorText}</p> : null}
      {loading ? <p className="mock-records-loading">正在加载考试记录…</p> : null}
      {!loading ? <section className="mock-records-section"><div className="mock-records-heading"><h2>{activeTab === "favorites" ? "收藏试卷" : "考试记录"}</h2><strong>{visibleCount} {activeTab === "favorites" ? "份" : "场"}</strong></div>{visibleRecords.length ? <div className="mock-records-list">{visibleRecords.map((record) => <article key={record.id} className="mock-records-card"><div><span>{String(record.exam_type || "TELC").toUpperCase()} {String(record.level || scope.level).toUpperCase()}</span><strong>{record.is_completed ? formatCompletedResult(record) : `未完成 · ${PHASE_LABELS[record.progress?.phase] || "阅读与语言模块"}`}</strong><small>{formatUpdatedAt(record.updated_at)}</small></div>{actionButtons(record)}</article>)}</div> : <p className="mock-records-empty-note">{activeTab === "favorites" ? "还没有收藏试卷" : "还没有考试记录"}</p>}<nav className="mock-records-pagination" aria-label="考试记录分页"><button type="button" disabled={!hasPreviousPage} onClick={() => changePage(visiblePage - 1)}>上一页</button><span>第 {visiblePage} 页</span><button type="button" disabled={!hasNextPage} onClick={() => changePage(visiblePage + 1)}>下一页</button></nav></section> : null}
    </div>
  );
}
