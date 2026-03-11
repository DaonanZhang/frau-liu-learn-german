import { useEffect, useState } from "react";
import "./Navigator.css";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../api/auth";

/**
 * Hook: track whether viewport is <= maxWidth.
 *
 * @param {number} maxWidth - Max viewport width in px.
 * @returns {boolean} True when viewport matches.
 */
function useIsMobileView(maxWidth) {
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);

    const update = () => {
      setIsMobileView(Boolean(mediaQuery.matches));
    };

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => {
        mediaQuery.removeEventListener("change", update);
      };
    }

    mediaQuery.addListener(update);
    return () => {
      mediaQuery.removeListener(update);
    };
  }, [maxWidth]);

  return isMobileView;
}

export default function Navigator() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isMobileView = useIsMobileView(990);

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

  const titleText = isMobileView ? "符号刘" : "符号刘的德语素材库";
  const manualText = isMobileView ? "手册" : "操作手册";
  const learningRecordsText = isMobileView ? "记录" : "学习记录";
  const lexiconText = isMobileView ? "卡片" : "德语卡片";
  const redeemText = isMobileView ? "兑换" : "兑换码";

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

          <div className="nav-user">
            <span className="nav-username">欢迎，{displayName}</span>
            <button className="nav-btn" type="button" onClick={handleLogout}>
              登出
            </button>
            <button
              className="nav-btn nav-btn--gradient"
              type="button"
              onClick={() => {
                navigate("/activate-entitlement");
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
