import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";

import { fetchPurchaseOffers, createAlipayPurchase, savePendingPaymentContext } from "../api/payments/alipay.js";
import { useAuth } from "../api/auth/useAuth.js";
import { MODULES_BY_ID } from "./Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";

import "./ModuleCheckoutPage.css";

function formatPromoPrice(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return numeric.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function getDisplayedSavings({ referenceOriginalPrice, originalPrice, displayPrice }) {
  const displayedOriginalPrice = Number.isFinite(referenceOriginalPrice)
    ? referenceOriginalPrice
    : originalPrice;
  if (!Number.isFinite(displayedOriginalPrice) || !Number.isFinite(displayPrice)) {
    return 0;
  }
  return Math.max(0, Number((displayedOriginalPrice - displayPrice).toFixed(2)));
}

function getDisplayPrice(offer) {
  const finalPrice = Number(offer?.final_price_amount);
  if (Number.isFinite(finalPrice)) {
    return finalPrice;
  }
  return Number(offer?.price_amount);
}

function getOriginalPrice(offer) {
  const originalPrice = Number(offer?.original_price_amount);
  if (Number.isFinite(originalPrice)) {
    return originalPrice;
  }
  return Number(offer?.price_amount);
}

function getReferenceOriginalPrice(module, offer) {
  const durationDays = Number(offer?.access_duration_days);
  const durationPrice = Number(module?.originalPricesByDuration?.[durationDays]);
  if (Number.isFinite(durationPrice)) {
    return durationPrice;
  }
  return Number(module?.originalPrice);
}

function getCurrentModuleExpiry(user, module) {
  const now = new Date();
  const expiries = (Array.isArray(user?.entitlements) ? user.entitlements : [])
    .filter((item) => {
      if (item?.status !== "active" || item?.module?.key !== module?.moduleKey) {
        return false;
      }
      const startsAt = item?.starts_at ? new Date(item.starts_at) : null;
      const expiresAt = item?.expires_at ? new Date(item.expires_at) : null;
      return (
        expiresAt
        && !Number.isNaN(expiresAt.getTime())
        && expiresAt > now
        && (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt <= now)
      );
    })
    .map((item) => new Date(item.expires_at));

  if (expiries.length === 0) {
    return null;
  }
  return new Date(Math.max(...expiries.map((date) => date.getTime())));
}

function formatCurrentExpiry(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function formatExpiry(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return "登录后显示预计到期时间";
  }
  return `预计有效至 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)}`;
}

export default function ModuleCheckoutPage() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { user, loading, isAuthenticated, reloadMe } = useAuth();
  const module = MODULES_BY_ID[moduleId];
  const alreadyHasAccess = useMemo(() => hasModuleAccess(user, module), [user, module]);
  const currentModuleExpiry = useMemo(() => getCurrentModuleExpiry(user, module), [user, module]);
  const isExamPreparation = module?.id === "exam-preparation";

  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [offersError, setOffersError] = useState("");
  const [creatingOrderCode, setCreatingOrderCode] = useState("");

  const targetSeasonNumber = useMemo(() => {
    if (Number.isFinite(Number(module?.purchaseSeasonNumber))) {
      return Number(module.purchaseSeasonNumber);
    }
    if (Number.isFinite(Number(module?.seasonNumber))) {
      return Number(module.seasonNumber);
    }
    return null;
  }, [module]);

  useEffect(() => {
    if (!module?.moduleKey) {
      return;
    }

    let aborted = false;

    async function loadOffers() {
      try {
        setLoadingOffers(true);
        setOffersError("");

        const data = await fetchPurchaseOffers({
          moduleKey: module.moduleKey,
          seasonNumber: targetSeasonNumber,
        });

        if (!aborted) {
          setOffers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!aborted) {
          setOffersError(err?.message ? String(err.message) : "Unknown error");
        }
      } finally {
        if (!aborted) {
          setLoadingOffers(false);
        }
      }
    }

    loadOffers();

    return () => {
      aborted = true;
    };
  }, [module, targetSeasonNumber]);

  useEffect(() => {
    if (!creatingOrderCode || !isAuthenticated || !module) {
      return;
    }

    let cancelled = false;
    let successHandled = false;

    async function syncAfterReturn() {
      const latestUser = await reloadMe();
      if (cancelled) {
        return;
      }

      if (hasModuleAccess(latestUser, module)) {
        successHandled = true;
        setCreatingOrderCode("");
        await Swal.fire({
          icon: "success",
          title: "支付成功",
          text: "购买的内容已经解锁。",
        });
        if (!cancelled) {
          navigate("/", { replace: true });
        }
        return;
      }

      setCreatingOrderCode("");
    }

    function handleWindowFocus() {
      if (!successHandled) {
        syncAfterReturn();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !successHandled) {
        syncAfterReturn();
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [creatingOrderCode, isAuthenticated, module, navigate, reloadMe]);

  async function handlePay(offer) {
    const offerCode = String(offer?.code || "").trim();
    if (!offerCode || creatingOrderCode) {
      return;
    }

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    try {
      setCreatingOrderCode(offerCode);
      const order = await createAlipayPurchase({
        offerCode,
      });
      savePendingPaymentContext(order?.merchant_order_no, {
        returnPath: `/modules/${module.id}/preview`,
        moduleId: module.id,
      });
      const payUrl = String(order?.pay_url || "").trim();
      if (!payUrl) {
        throw new Error("Missing pay_url");
      }
      window.location.assign(payUrl);
    } catch (err) {
      setOffersError(err?.data?.detail || err?.message || "创建支付订单失败");
      setCreatingOrderCode("");
    }
  }

  if (!module) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return null;
  }

  return (
    <div className="module-checkout-page">
      <button
        className="module-checkout-page__back"
        type="button"
        onClick={() => {
          navigate(-1);
        }}
      >
        <span aria-hidden="true">←</span>
        <span>返回</span>
      </button>

      <section className="module-checkout-page__hero">
        <img className="module-checkout-page__image" src={module.image} alt={module.title} />
        <div className="module-checkout-page__content">
          <div className="module-checkout-page__eyebrow">支付页面</div>
          <h1 className="module-checkout-page__title">{module.title}</h1>
          <div className="module-checkout-page__labels">
            {(module.purchaseLabels || []).map((item) => (
              <span key={item} className="module-checkout-page__label">
                {item}
              </span>
            ))}
          </div>
          <p className="module-checkout-page__description">{module.purchaseDescription}</p>
          <p className="module-checkout-page__notice">
            {isExamPreparation
              ? "集中练习听力、阅读、语言模块、写作与口语，为考试做好更充分的准备。"
              : alreadyHasAccess
                ? "你当前已有有效权限，新购买的天数会从现有最晚到期时间继续顺延。"
                : "支付成功后将自动开通对应模块权限，有效期从支付确认时刻开始计算。"}
          </p>
        </div>
      </section>

      {isExamPreparation && currentModuleExpiry ? (
        <section className="module-checkout-page__current-access" aria-label="当前备考季有效期">
          <div className="module-checkout-page__current-access-icon" aria-hidden="true">✓</div>
          <div>
            <div className="module-checkout-page__current-access-label">当前备考季有效期</div>
            <strong className="module-checkout-page__current-access-date">
              有效至 {formatCurrentExpiry(currentModuleExpiry)}
            </strong>
            <p className="module-checkout-page__current-access-note">
              再次购买时，所选天数会从当前到期时间继续顺延。
            </p>
          </div>
        </section>
      ) : null}

      {loadingOffers ? <div className="module-checkout-page__state">加载购买方案中...</div> : null}
        {!loadingOffers && offersError ? (
          <div className="module-checkout-page__state module-checkout-page__state--error">
            {offersError}
          </div>
        ) : null}
        {!loadingOffers && !offersError && offers.length === 0 ? (
          <div className="module-checkout-page__state">当前模块暂未配置可售商品。</div>
        ) : null}

        {!loadingOffers && !offersError && offers.length > 0 ? (
          <div className="module-checkout-page__desktop-layout">
            <div className="module-checkout-page__offer-list">
              {offers.map((offer) => {
                const isCreating = creatingOrderCode === offer.code;
                const displayPrice = getDisplayPrice(offer);
                const originalPrice = getOriginalPrice(offer);
                const referenceOriginalPrice = getReferenceOriginalPrice(module, offer);
                const hasDiscount = Boolean(offer?.is_discounted_for_user) && Number(offer?.discount_amount) > 0;
                const displayedSavings = getDisplayedSavings({
                  referenceOriginalPrice,
                  originalPrice,
                  displayPrice,
                });
                return (
                  <article key={offer.code} className="module-checkout-page__offer">
                    <div className="module-checkout-page__offer-shell">
                      <div className="module-checkout-page__offer-body">
                        <div className="module-checkout-page__offer-top">
                        <div>
                          <h3 className="module-checkout-page__offer-title">{offer.title || module.title}</h3>
                          <p className="module-checkout-page__offer-meta">
                            {offer.access_duration_days ? `${offer.access_duration_days} 天有效` : offer.plan_label}
                          </p>
                          <p className="module-checkout-page__offer-expiry">
                            {formatExpiry(offer.estimated_expires_at)}
                          </p>
                        </div>
                      </div>

                        <p className="module-checkout-page__offer-description">
                          {isExamPreparation
                            ? "激活备考季全部内容！"
                            : offer.description || `解锁 ${module.title} 全部正式学习内容、工具与后续学习体验。`}
                        </p>

                        <ul className="module-checkout-page__offer-notes">
                          {isExamPreparation ? (
                            <>
                              <li>听力、阅读、语言模块、写作与口语题型，一次解锁。</li>
                              <li>支持支付宝安全支付，付款完成后即可开始练习。</li>
                              <li>保留学习进度与收藏记录。</li>
                            </>
                          ) : (
                            <>
                              <li>一次购买，解锁本方案包含的全部正式学习内容。</li>
                              <li>支持支付宝安全支付，付款完成后即可开始学习。</li>
                            </>
                          )}
                        </ul>
                      </div>

                      <aside className="module-checkout-page__offer-aside">
                        <div className="module-checkout-page__price-card">
                          <div className="module-checkout-page__price-caption">当前支付金额</div>
                          {hasDiscount ? (
                            <div className="module-checkout-page__offer-badge module-checkout-page__offer-badge--inline">
                              {offer.discount_label || "品牌挚友专享"}
                            </div>
                          ) : null}
                          <div className="module-checkout-page__price-block">
                            <div className="module-checkout-page__price-row">
                              {Number.isFinite(referenceOriginalPrice) ? (
                                <span className="module-checkout-page__price-list">
                                  ¥{formatPromoPrice(referenceOriginalPrice)}
                                </span>
                              ) : null}
                              {Number.isFinite(originalPrice) ? (
                                <span className={`module-checkout-page__price-original${hasDiscount ? " module-checkout-page__price-original--discounted" : ""}`}>
                                  ¥{formatPromoPrice(originalPrice)}
                                </span>
                              ) : null}
                              {hasDiscount ? (
                                <span className="module-checkout-page__price-sale module-checkout-page__price-sale--discount">
                                  ¥{formatPromoPrice(displayPrice)}
                                </span>
                              ) : null}
                            </div>
                            {hasDiscount ? (
                              <div className="module-checkout-page__discount-note">
                                已减 ¥{formatPromoPrice(displayedSavings)}
                              </div>
                            ) : null}
                          </div>

                          <button
                            className="module-checkout-page__pay"
                            type="button"
                            disabled={Boolean(creatingOrderCode)}
                            onClick={() => {
                              handlePay(offer);
                            }}
                          >
                            {isCreating ? "跳转支付中..." : "去支付宝支付"}
                          </button>
                        </div>
                      </aside>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

      <div className="module-checkout-page__footer-row">
        <button
          className="module-checkout-page__trial"
          type="button"
          onClick={() => {
            if (module?.route) {
              navigate(module.route);
            }
          }}
        >
          {isExamPreparation ? "免费试用" : "立刻试用"}
        </button>
        <button
          className="module-checkout-page__ghost"
          type="button"
          onClick={() => {
            navigate("/");
          }}
        >
          稍后再说
        </button>
      </div>
    </div>
  );
}
