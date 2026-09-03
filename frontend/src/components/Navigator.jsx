import "./Navigator.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../api/auth";
import useMaxWidth from "../hooks/useMaxWidth.js";
import { EXAM_PREPARATION_MODULE } from "../pages/Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";

export default function Navigator() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isMobileView = useMaxWidth(990);

  if (loading) {
    return null;
  }

  const displayName = user?.username || user?.telephone || "用户";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const pathname = location.pathname;

  const isManualActive = pathname.startsWith("/manual");
  const isLearningRecordsActive = pathname.startsWith("/learning-records");
  const isLexiconActive = pathname.startsWith("/lexicon");
  const isFavoriteQuestionsActive = pathname.startsWith("/favorite-questions");
  const isProfileActive = pathname.startsWith("/profile");
  const isExamPreparationActive = pathname.startsWith("/modules/exam-preparation");
  const isExamPreparationPurchaseActive = pathname === "/modules/exam-preparation/purchase";

  const titleText = isMobileView ? "符号刘" : "符号刘的德语素材库";
  const manualText = isMobileView ? "手册" : "操作手册";
  const learningRecordsText = isMobileView ? "记录" : "学习记录";
  const lexiconText = isMobileView ? "卡片" : "德语卡片";
  const favoriteQuestionsText = isMobileView ? "收藏题" : "收藏题目";
  const redeemText = isMobileView ? "兑换" : "兑换码";
  const hasFullExamAccess = hasModuleAccess(user, EXAM_PREPARATION_MODULE);
  const examRenewText = hasFullExamAccess
    ? (isMobileView ? "续费" : "延长备考季")
    : (isMobileView ? "解锁" : "解锁备考季");

  return (
    <header className="navigator">
      <div className="nav-container">
        <div
          className="nav-left"
          role="button"
          tabIndex={0}
          onClick={() => {
            navigate("/");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              navigate("/");
            }
          }}
        >
          <img src="/images/icon.jpeg" alt="logo" className="nav-logo" />
          <span className="nav-title">{titleText}</span>
        </div>

        <nav className="nav-right">
          {isExamPreparationActive ? (
            <button
              className={[
                "nav-btn",
                "nav-btn--exam-renew",
                isExamPreparationPurchaseActive ? "nav-btn--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => {
                navigate("/modules/exam-preparation/purchase");
              }}
            >
              {examRenewText}
            </button>
          ) : null}

          <button
            className={[
              "nav-btn",
              isManualActive ? "nav-btn--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => {
              navigate("/manual");
            }}
          >
            {manualText}
          </button>

          <button
            className={[
              "nav-btn",
              isLearningRecordsActive ? "nav-btn--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => {
              navigate("/learning-records");
            }}
          >
            {learningRecordsText}
          </button>

          <button
            className={["nav-btn", isLexiconActive ? "nav-btn--active" : ""]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => {
              navigate("/lexicon");
            }}
          >
            {lexiconText}
          </button>

          <button
            className={["nav-btn", isFavoriteQuestionsActive ? "nav-btn--active" : ""]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => {
              navigate("/favorite-questions");
            }}
          >
            {favoriteQuestionsText}
          </button>

          <div className="nav-user">
            <button
              className={[
                "nav-username",
                "nav-profileLink",
                isProfileActive ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              onClick={() => {
                navigate("/profile");
              }}
            >
              {displayName}
            </button>
            <button className="nav-btn" type="button" onClick={handleLogout}>
              登出
            </button>
            <button
              className="nav-btn nav-btn--gradient"
              type="button"
              onClick={() => {
                navigate("/redeem-code");
              }}
            >
              {redeemText}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
