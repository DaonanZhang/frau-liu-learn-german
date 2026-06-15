import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { markDailyActiveAndGetUserData } from "../api/user_data/userData";
import { fetchLearningVideoUserData } from "../api/learning_by_video/userData";
import { useAuth } from "../api/auth/useAuth.js";
import useBodyScrollLock from "../hooks/useBodyScrollLock";
import useMaxWidth from "../hooks/useMaxWidth.js";
import HomeSidebarContent from "./Homepage/HomeSidebarContent.jsx";
import {
  EXAM_PREPARATION_MODULE,
  SCIENCE_SEASON_MODULE,
  VLOG_SEASON_MODULE,
  buildStats,
  toSafeNumber,
} from "./Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";

import "./Home.css";
import "./Homepage/ModuleEntryCard.css";

function buildCoverCandidates(src) {
  const normalized = typeof src === "string" ? src.trim() : "";
  if (!normalized) {
    return [];
  }
  if (/\.(png|jpe?g|webp)$/i.test(normalized)) {
    return [normalized];
  }
  return [`${normalized}.png`, `${normalized}.jpg`, `${normalized}.webp`];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPurchaseModalHtml(module) {
  const image = module?.image
    ? `<img class="module-purchase-modal__image" src="${escapeHtml(module.image)}" alt="${escapeHtml(module.title)}" />`
    : "";
  const labels = Array.isArray(module?.purchaseLabels) && module.purchaseLabels.length
    ? `<div class="module-purchase-modal__labels">${module.purchaseLabels
        .map((item) => `<span class="module-purchase-modal__label">${escapeHtml(item)}</span>`)
        .join("")}</div>`
    : "";
  const description = module?.purchaseDescription
    ? `<p class="module-purchase-modal__description">${escapeHtml(module.purchaseDescription)}</p>`
    : "";
  const features = Array.isArray(module?.purchaseFeatures) && module.purchaseFeatures.length
    ? `<ul class="module-purchase-modal__list">${module.purchaseFeatures
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    : "";

  return `
    <div class="module-purchase-modal">
      ${image}
      ${labels}
      ${description}
      ${features}
    </div>
  `;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [learningVideoUserData, setLearningVideoUserData] = useState(null);
  const [failedSources, setFailedSources] = useState({});

  const isMobileView = useMaxWidth(990);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  useBodyScrollLock(isMobileView && isMobileSidebarOpen);

  useEffect(() => {
    let aborted = false;

    markDailyActiveAndGetUserData()
      .then((data) => {
        if (aborted) {
          return;
        }
        setUserData(data || null);
      })
      .catch(() => {
        // silently fail
      });

    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    let aborted = false;

    fetchLearningVideoUserData()
      .then((data) => {
        if (aborted) {
          return;
        }
        setLearningVideoUserData(data || null);
      })
      .catch(() => {
        // silently fail
      });

    return () => {
      aborted = true;
    };
  }, []);

  const completedVideos = useMemo(() => {
    return toSafeNumber(learningVideoUserData?.completed_count);
  }, [learningVideoUserData]);

  const activeDays = useMemo(() => {
    return toSafeNumber(userData?.active_days);
  }, [userData]);

  const stats = useMemo(() => {
    return buildStats(50, completedVideos, activeDays);
  }, [completedVideos, activeDays]);

  const modules = useMemo(() => {
    return [SCIENCE_SEASON_MODULE, VLOG_SEASON_MODULE, EXAM_PREPARATION_MODULE];
  }, []);

  return (
    <div className="home-page">
      <div className={`home-layout ${isMobileView ? "home-layout--mobile" : ""}`}>
        <div
          className={`home-mobile-overlay ${
            isMobileView && isMobileSidebarOpen ? "home-mobile-overlay--open" : ""
          }`}
          role="button"
          tabIndex={0}
          onClick={() => {
            setIsMobileSidebarOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsMobileSidebarOpen(false);
            }
          }}
        />

        <aside
          className={`home-left ${
            isMobileView ? "home-left--drawer" : ""
          } ${isMobileView && isMobileSidebarOpen ? "home-left--open" : ""}`}
          aria-hidden={isMobileView && !isMobileSidebarOpen}
        >
          <HomeSidebarContent
            stats={stats}
            activeDates={userData?.active_dates || []}
            activeDaysCount={activeDays}
            isMobileView={isMobileView}
            showStats={false}
            onCloseMobile={() => {
              setIsMobileSidebarOpen(false);
            }}
          />
        </aside>

        <main className="home-right">
          {isMobileView && (
            <div
              className="home-mobile-toolbar"
              role="button"
              tabIndex={0}
              onClick={() => {
                setIsMobileSidebarOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  setIsMobileSidebarOpen(true);
                }
              }}
            >
              <div className="home-mobile-toolbar-content">
                <span className="home-mobile-toolbar-icon">☰</span>
                <span className="home-mobile-toolbar-text">学习面板</span>
              </div>
            </div>
          )}

          <section className="home-module-section" aria-label="学习模块">
            <div className="home-module-grid">
              {modules.map((module) => {
                const canEnterModule = hasModuleAccess(user, module);
                const coverCandidates = buildCoverCandidates(module?.image);
                const coverSrc = coverCandidates.find((item) => !failedSources[item]) || "";

                return (
                  <article
                    key={module.id}
                    className="module-entry-card"
                    role="button"
                    tabIndex={0}
                    onClick={async () => {
                      if (canEnterModule && module?.route) {
                        navigate(module.route);
                        return;
                      }

                      const result = await Swal.fire({
                        title: module?.title || "立刻查看",
                        html: buildPurchaseModalHtml(module),
                        showCancelButton: true,
                        showDenyButton: true,
                        confirmButtonText: "立刻购买",
                        denyButtonText: "立刻试用",
                        cancelButtonText: "稍后再看",
                        customClass: {
                          popup: "module-purchase-modal-popup",
                          title: "module-purchase-modal-title",
                          htmlContainer: "module-purchase-modal-container",
                          actions: "module-purchase-modal-actions",
                          confirmButton: "module-purchase-modal-confirm",
                          denyButton: "module-purchase-modal-confirm",
                          cancelButton: "module-purchase-modal-cancel",
                        },
                        buttonsStyling: false,
                        width: 720,
                      });

                      if (result.isConfirmed) {
                        navigate(`/modules/${module.id}/purchase`);
                        return;
                      }

                      if (result.isDenied && module?.route) {
                        navigate(module.route);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.currentTarget.click();
                      }
                    }}
                  >
                    <div className="module-entry-card__media">
                      {coverSrc ? (
                        <img
                          className="module-entry-card__image"
                          src={coverSrc}
                          alt={module?.title || "module"}
                          onError={() => {
                            setFailedSources((previous) => ({
                              ...previous,
                              [coverSrc]: true,
                            }));
                          }}
                        />
                      ) : (
                        <div className="module-entry-card__image module-entry-card__image--placeholder" />
                      )}
                      <div className="module-entry-card__overlay" />
                      {module?.badge ? <span className="module-entry-card__badge">{module.badge}</span> : null}
                    </div>

                    <div className="module-entry-card__body">
                      <div className="module-entry-card__heading">
                        <h2 className="module-entry-card__title">{module?.title}</h2>
                        {module?.subtitle ? (
                          <p className="module-entry-card__subtitle">{module.subtitle}</p>
                        ) : null}
                      </div>

                      {module?.description ? (
                        <p className="module-entry-card__description">{module.description}</p>
                      ) : null}

                      <div className="module-entry-card__chips">
                        {(module?.stats || []).map((item) => (
                          <span key={item} className="module-entry-card__chip">
                            {item}
                          </span>
                        ))}
                      </div>

                      <div className="module-entry-card__cta">
                        <span>{canEnterModule ? "进入模块" : "立刻查看"}</span>
                        <span aria-hidden="true">→</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
