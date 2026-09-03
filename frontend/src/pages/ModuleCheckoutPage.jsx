import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";

import { fetchPurchaseOffers, createAlipayPurchase, savePendingPaymentContext } from "../api/payments/alipay.js";
import { fetchCouponChoices } from "../api/coupons.js";
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

function formatCouponExpiry(value) {
  if (!value) {
    return "长期有效";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "长期有效";
  }
  return `有效期至 ${new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)}`;
}

function formatCouponScope(coupon) {
  const scope = coupon?.scope || {};
  if (scope.offer_title) {
    return scope.offer_title;
  }
  if (scope.module_name && scope.season_number) {
    return `${scope.module_name} · Season ${scope.season_number}`;
  }
  if (scope.module_name) {
    return scope.module_name;
  }
  return "全部商品";
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
  const [searchParams] = useSearchParams();
  const { user, loading, isAuthenticated, reloadMe } = useAuth();
  const module = MODULES_BY_ID[moduleId];
  const alreadyHasAccess = useMemo(() => hasModuleAccess(user, module), [user, module]);
  const currentModuleExpiry = useMemo(() => getCurrentModuleExpiry(user, module), [user, module]);
  const isExamPreparation = module?.id === "exam-preparation";
  const requestedCouponId = useMemo(() => {
    const value = Number(searchParams.get("coupon"));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [searchParams]);

  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [offersError, setOffersError] = useState("");
  const [creatingOrderCode, setCreatingOrderCode] = useState("");
  const [couponChoicesByOffer, setCouponChoicesByOffer] = useState({});
  const [selectedCouponByOffer, setSelectedCouponByOffer] = useState({});
  const [couponSelectionModeByOffer, setCouponSelectionModeByOffer] = useState({});
  const [couponSheetOfferCode, setCouponSheetOfferCode] = useState("");

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
          const nextOffers = Array.isArray(data) ? data : [];
          setOffers(nextOffers);

          if (isAuthenticated) {
            const choiceResults = await Promise.allSettled(
              nextOffers.map((offer) => fetchCouponChoices(offer.code))
            );
            if (!aborted) {
              const choicesByOffer = {};
              const defaultsByOffer = {};
              const modesByOffer = {};
              choiceResults.forEach((result, index) => {
                if (result.status === "fulfilled") {
                  const offerCode = nextOffers[index].code;
                  choicesByOffer[offerCode] = result.value;
                  const requestedChoice = result.value?.choices?.find(
                    (choice) => choice?.coupon?.id === requestedCouponId && choice?.is_applicable
                  );
                  defaultsByOffer[offerCode] = requestedChoice
                    ? requestedCouponId
                    : result.value?.default_coupon_id ?? null;
                  modesByOffer[offerCode] = requestedChoice ? "manual" : "automatic";
                }
              });
              setCouponChoicesByOffer(choicesByOffer);
              setSelectedCouponByOffer(defaultsByOffer);
              setCouponSelectionModeByOffer(modesByOffer);
            }
          } else {
            setCouponChoicesByOffer({});
            setSelectedCouponByOffer({});
            setCouponSelectionModeByOffer({});
          }
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
  }, [isAuthenticated, module, requestedCouponId, targetSeasonNumber]);

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
      const couponBundle = couponChoicesByOffer[offerCode];
      const hasExplicitSelection = Object.prototype.hasOwnProperty.call(
        selectedCouponByOffer,
        offerCode
      );
      const selectedCouponId = hasExplicitSelection
        ? selectedCouponByOffer[offerCode]
        : offer?.promotion_coupon_id ?? couponBundle?.default_coupon_id ?? null;
      const couponSelectionMode = couponSelectionModeByOffer[offerCode] || "automatic";
      const order = await createAlipayPurchase({
        offerCode,
        couponId: couponSelectionMode === "manual" ? selectedCouponId : undefined,
        useCoupon: couponSelectionMode !== "none",
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
                const couponBundle = couponChoicesByOffer[offer.code];
                const hasExplicitSelection = Object.prototype.hasOwnProperty.call(
                  selectedCouponByOffer,
                  offer.code
                );
                const selectedCouponId = hasExplicitSelection
                  ? selectedCouponByOffer[offer.code]
                  : offer?.promotion_coupon_id ?? couponBundle?.default_coupon_id ?? null;
                const selectedChoice = couponBundle?.choices?.find(
                  (item) => item?.coupon?.id === selectedCouponId
                );
                const selectedPricing = selectedCouponId === null
                  ? couponBundle?.no_coupon_pricing
                  : selectedChoice?.pricing;
                const displayPrice = Number(selectedPricing?.final_amount ?? getDisplayPrice(offer));
                const originalPrice = Number(selectedPricing?.original_amount ?? getOriginalPrice(offer));
                const referenceOriginalPrice = getReferenceOriginalPrice(module, offer);
                const totalDiscount = Number(
                  selectedPricing?.total_discount_amount ?? offer?.discount_amount
                );
                const displayedSavings = getDisplayedSavings({
                  referenceOriginalPrice,
                  originalPrice,
                  displayPrice,
                });
                const effectiveSavings = displayedSavings > 0
                  ? displayedSavings
                  : Math.max(0, Number.isFinite(totalDiscount) ? totalDiscount : 0);
                const hasDiscount = effectiveSavings > 0;
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
                              优惠
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
                                已减 ¥{formatPromoPrice(effectiveSavings)}
                              </div>
                            ) : null}
                          </div>

                          <button
                            className="module-checkout-page__couponSelector"
                            type="button"
                            disabled={!couponBundle}
                            onClick={() => setCouponSheetOfferCode(offer.code)}
                          >
                            <span className="module-checkout-page__couponSelectorIcon" aria-hidden="true">券</span>
                            <span className="module-checkout-page__couponSelectorText">
                              <strong>优惠券</strong>
                              <small>
                                {selectedChoice
                                  ? `已选优惠券 · 本单减 ¥${formatPromoPrice(selectedChoice.pricing?.promotion_discount_amount)}`
                                  : selectedCouponId === null
                                    ? "不使用优惠券"
                                    : couponBundle
                                      ? "暂无适用优惠券"
                                      : "正在匹配最优优惠"}
                              </small>
                            </span>
                            {couponBundle?.available_count > 0 ? (
                              <span className="module-checkout-page__couponSelectorCount">
                                {couponBundle.available_count} 张可用
                              </span>
                            ) : null}
                            <span className="module-checkout-page__couponSelectorArrow" aria-hidden="true">›</span>
                          </button>

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

      {couponSheetOfferCode ? (() => {
        const couponBundle = couponChoicesByOffer[couponSheetOfferCode];
        const activeOffer = offers.find((offer) => offer.code === couponSheetOfferCode);
        const selectedCouponId = Object.prototype.hasOwnProperty.call(
          selectedCouponByOffer,
          couponSheetOfferCode
        )
          ? selectedCouponByOffer[couponSheetOfferCode]
          : couponBundle?.default_coupon_id ?? null;
        return (
          <div className="module-checkout-page__couponOverlay" role="presentation">
            <button
              type="button"
              className="module-checkout-page__couponBackdrop"
              aria-label="关闭优惠券选择"
              onClick={() => setCouponSheetOfferCode("")}
            />
            <section
              className="module-checkout-page__couponSheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="coupon-sheet-title"
            >
              <div className="module-checkout-page__couponSheetHandle" aria-hidden="true" />
              <div className="module-checkout-page__couponSheetHeader">
                <div>
                  <div className="module-checkout-page__couponSheetEyebrow">SMART SAVINGS</div>
                  <h2 id="coupon-sheet-title">选择优惠券</h2>
                  <p>{activeOffer?.title || "当前商品"} · 默认选择最省方案</p>
                </div>
                <button type="button" onClick={() => setCouponSheetOfferCode("")} aria-label="关闭">×</button>
              </div>

              <div className="module-checkout-page__couponChoices">
                {(couponBundle?.choices || []).map((choice) => {
                  const coupon = choice.coupon;
                  const checked = selectedCouponId === coupon.id;
                  return (
                    <button
                      key={coupon.id}
                      type="button"
                      disabled={!choice.is_applicable}
                      className={`module-checkout-page__couponChoice${checked ? " is-selected" : ""}${!choice.is_applicable ? " is-disabled" : ""}`}
                      onClick={() => {
                        setSelectedCouponByOffer((current) => ({
                          ...current,
                          [couponSheetOfferCode]: coupon.id,
                        }));
                        setCouponSelectionModeByOffer((current) => ({
                          ...current,
                          [couponSheetOfferCode]: "manual",
                        }));
                        setCouponSheetOfferCode("");
                      }}
                    >
                      <span className="module-checkout-page__couponChoiceValue">
                        <strong><small>¥</small>{formatPromoPrice(coupon.discount_amount)}</strong>
                        <small>{Number(coupon.minimum_order_amount) > 0 ? `满 ¥${formatPromoPrice(coupon.minimum_order_amount)} 可用` : "无门槛"}</small>
                      </span>
                      <span className="module-checkout-page__couponChoiceBody">
                        <strong>{Number(coupon.minimum_order_amount) > 0 ? "满减优惠券" : "无门槛优惠券"}</strong>
                        <small>适用于：{formatCouponScope(coupon)}</small>
                        <small>{formatCouponExpiry(coupon.expires_at)}</small>
                        <em>{choice.is_applicable ? `本单优惠 ¥${choice.pricing?.promotion_discount_amount}` : choice.unavailable_reason}</em>
                      </span>
                      <span className="module-checkout-page__couponRadio" aria-hidden="true">{checked ? "✓" : ""}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  className={`module-checkout-page__couponChoice module-checkout-page__couponChoice--none${selectedCouponId === null ? " is-selected" : ""}`}
                  onClick={() => {
                    setSelectedCouponByOffer((current) => ({
                      ...current,
                      [couponSheetOfferCode]: null,
                    }));
                    setCouponSelectionModeByOffer((current) => ({
                      ...current,
                      [couponSheetOfferCode]: "none",
                    }));
                    setCouponSheetOfferCode("");
                  }}
                >
                  <span className="module-checkout-page__couponChoiceNoneIcon" aria-hidden="true">—</span>
                  <span className="module-checkout-page__couponChoiceBody">
                    <strong>不使用优惠券</strong>
                    <small>仅保留当前账号自动享有的优惠</small>
                  </span>
                  <span className="module-checkout-page__couponRadio" aria-hidden="true">{selectedCouponId === null ? "✓" : ""}</span>
                </button>
              </div>
            </section>
          </div>
        );
      })() : null}
    </div>
  );
}
