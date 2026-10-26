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
import {
  formatExpiredDuration,
  getLatestExpiredModuleExpiry,
  hasModuleAccess,
} from "../utils/moduleAccess.js";
import { addRedeemActionToPurchaseModal } from "../utils/modulePurchaseRedeem.js";

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

function buildPurchaseModalHtml(module, expiredAt) {
  const image = module?.image
    ? `<img class="module-purchase-modal__image" src="${escapeHtml(module.image)}" alt="${escapeHtml(module.title)}" />`
    : "";
  const labels = Array.isArray(module?.stats) && module.stats.length
    ? `<div class="module-purchase-modal__labels">${module.stats
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
  const notice = module?.purchaseNotice
    ? `<p class="module-purchase-modal__notice">${escapeHtml(module.purchaseNotice)}</p>`
    : "";
  const expiredAccess = expiredAt
    ? `<div class="module-purchase-modal__expired-access">
        <strong>备考季权限已过期</strong>
        <span>${escapeHtml(formatExpiredDuration(expiredAt))}</span>
      </div>`
    : "";

  return `
    <div class="module-purchase-modal">
      ${image}
      ${expiredAccess}
      ${labels}
      ${description}
      ${features}
      ${notice}
    </div>
  `;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [learningVideoUserData, setLearningVideoUserData] = useState(null);
  const [failedSources, setFailedSources] = useState({});
  const [showInvitationModal, setShowInvitationModal] = useState(true);

  const isMobileView = useMaxWidth(990);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  useBodyScrollLock(showInvitationModal || (isMobileView && isMobileSidebarOpen));

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
      {showInvitationModal && (
        <div className="home-invitation-modal__overlay">
          <section
            className="home-invitation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-invitation-title"
          >
            <button
              className="home-invitation-modal__close"
              type="button"
              aria-label="关闭邀请有礼弹窗"
              onClick={() => setShowInvitationModal(false)}
            >
              ×
            </button>

            <header className="home-invitation-modal__header">
              <h2 id="home-invitation-title">🎉 【符号刘德语备考平台】<br />邀请有礼功能正式上线！</h2>
              <p>邀请好友一起学德语，双方都能拿奖励！</p>
            </header>

            <section className="home-invitation-modal__card">
              <h3>🎁 好友专属优惠</h3>
              <p>只要好友作为网站新用户使用你的专属分享码下单备考季，即可享受 <strong>立减 5 元</strong> 优惠！</p>
            </section>

            <section className="home-invitation-modal__card">
              <h3>🚀 你的阶梯奖励 <small>（成功推荐下单备考季）</small></h3>
              <ul className="home-invitation-modal__rewards">
                <li><span aria-hidden="true">✅</span><p>推荐 1 人：备考季自动 <strong>延长 1 个月</strong>（可无限叠加！）</p></li>
                <li><span aria-hidden="true">✅</span><p>推荐 3 人：额外赠送 <strong>【科普季】</strong>权限<small>（如已拥有则赠送 10 元优惠券）</small></p></li>
                <li><span aria-hidden="true">✅</span><p>推荐 5 人：额外解锁赠送 <strong>【Vlog】</strong>权限<small>（如已拥有则赠送 10 元优惠券）</small></p></li>
              </ul>
            </section>

            <section className="home-invitation-modal__guide">
              <h3>🔗 如何获取分享码？</h3>
              <p>现在登录网站，进入个人页面（网页右上角），即可一键复制。</p>
              <p>👉 国内：<a href="https://www.frauliu.com">www.frauliu.com</a>｜海外：<a href="https://www.frauliu.cn">www.frauliu.cn</a></p>
            </section>

            <button
              className="home-invitation-modal__cta"
              type="button"
              onClick={() => {
                setShowInvitationModal(false);
                navigate("/profile#referral-campaign");
              }}
            >
              立即前往获取 <span aria-hidden="true">→</span>
            </button>
          </section>
        </div>
      )}
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
                const expiredAt = module.id === "exam-preparation"
                  ? getLatestExpiredModuleExpiry(user, module)
                  : null;
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
                        html: buildPurchaseModalHtml(module, expiredAt),
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
                        didOpen: (popup) => {
                          addRedeemActionToPurchaseModal(popup, `/modules/${module.id}/purchase`, navigate, () => Swal.close());
                        },
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
                      {module?.badge ? (
                        <span className="module-entry-card__badge">{module.badge}</span>
                      ) : null}
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
                        <span>
                          {canEnterModule ? "进入模块" : "立刻查看"}
                        </span>
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
