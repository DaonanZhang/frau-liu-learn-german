import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";
import { fetchMyProfile, updateMyProfile } from "../api/auth/profile.js";
import { fetchMyCoupons } from "../api/coupons.js";
import { MODULES_BY_ID } from "./Homepage/homeShared.js";
import "./ProfilePage.css";

const COUNTRY_CODE_OPTIONS = [
  { value: "+86", label: "🇨🇳 中国 +86" },
  { value: "+49", label: "🇩🇪 德国 +49" },
  { value: "+43", label: "🇦🇹 奥地利 +43" },
  { value: "+41", label: "🇨🇭 瑞士 +41" },
  { value: "+852", label: "🇭🇰 中国香港 +852" },
  { value: "+853", label: "🇲🇴 中国澳门 +853" },
  { value: "+886", label: "中国台湾 +886" },
  { value: "+65", label: "🇸🇬 新加坡 +65" },
  { value: "+81", label: "🇯🇵 日本 +81" },
  { value: "+82", label: "🇰🇷 韩国 +82" },
  { value: "+44", label: "🇬🇧 英国 +44" },
  { value: "+33", label: "🇫🇷 法国 +33" },
  { value: "+1", label: "🇺🇸 美国 +1" },
  { value: "+61", label: "🇦🇺 澳大利亚 +61" },
];

const COUPON_FILTERS = [
  { key: "available", label: "可使用" },
  { key: "used", label: "已使用" },
  { key: "expired", label: "已失效" },
];

const COUPON_STATUS_LABELS = {
  available: "可使用",
  reserved: "订单占用中",
  used: "已使用",
  expired: "已过期",
  revoked: "已失效",
};

const PURCHASE_MODULES = Object.values(MODULES_BY_ID);

function couponFilterKey(coupon) {
  const status = coupon?.effective_status || coupon?.status;
  if (status === "available" || status === "reserved") {
    return "available";
  }
  return status === "used" ? "used" : "expired";
}

function formatCouponDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatCouponAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "0";
  }
  return amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function couponScopeLabel(coupon) {
  const scope = coupon?.scope || {};
  if (scope.offer_title) {
    return scope.offer_title;
  }
  if (scope.season_title) {
    return scope.season_title;
  }
  if (scope.module_name) {
    return scope.module_name;
  }
  return "全部商品";
}

function couponCanUseForModule(coupon, module) {
  const scope = coupon?.scope || {};
  if (scope.module_key && scope.module_key !== module.moduleKey) {
    return false;
  }
  if (scope.season_number != null) {
    return Number(scope.season_number) === Number(module.purchaseSeasonNumber);
  }
  return true;
}

function extractErrorMessage(error) {
  if (!error) {
    return "保存失败，请稍后重试。";
  }

  const detail = error?.data?.detail;
  if (detail) {
    return String(detail);
  }

  const usernameError = error?.data?.username;
  if (Array.isArray(usernameError) && usernameError.length > 0) {
    return String(usernameError[0]);
  }

  const emailError = error?.data?.email;
  if (Array.isArray(emailError) && emailError.length > 0) {
    return String(emailError[0]);
  }

  if (error?.message) {
    return String(error.message);
  }

  return "保存失败，请稍后重试。";
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, reloadMe } = useAuth();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [couponError, setCouponError] = useState("");
  const [couponFilter, setCouponFilter] = useState("available");
  const [couponToUse, setCouponToUse] = useState(null);

  const [countryCode, setCountryCode] = useState("+86");
  const [telephone, setTelephone] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const normalizedUsername = useMemo(() => username.trim(), [username]);
  const normalizedEmail = useMemo(() => email.trim(), [email]);
  const canSave = !saving && !loadingProfile;
  const filteredCoupons = useMemo(
    () => coupons.filter((coupon) => couponFilterKey(coupon) === couponFilter),
    [couponFilter, coupons]
  );
  const couponCounts = useMemo(
    () => COUPON_FILTERS.reduce((counts, item) => ({
      ...counts,
      [item.key]: coupons.filter((coupon) => couponFilterKey(coupon) === item.key).length,
    }), {}),
    [coupons]
  );
  const couponModules = useMemo(
    () => PURCHASE_MODULES.filter((module) => couponCanUseForModule(couponToUse, module)),
    [couponToUse]
  );

  useEffect(() => {
    if (!couponToUse) {
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setCouponToUse(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [couponToUse]);

  useEffect(() => {
    let aborted = false;

    async function loadProfile() {
      try {
        setLoadingProfile(true);
        setErrorText("");
        setSuccessText("");

        const profile = await fetchMyProfile();
        if (aborted) {
          return;
        }

        setTelephone(String(profile?.telephone || ""));
        setCountryCode(String(profile?.country_code || "+86"));
        setUsername(String(profile?.username || ""));
        setEmail(String(profile?.email || ""));
      } catch (error) {
        if (aborted) {
          return;
        }
        setErrorText(extractErrorMessage(error));
      } finally {
        if (!aborted) {
          setLoadingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    if (!loadingCoupons && window.location.hash === "#coupons") {
      window.requestAnimationFrame(() => {
        document.getElementById("coupons")?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [loadingCoupons]);

  useEffect(() => {
    let aborted = false;

    async function loadCoupons() {
      try {
        setLoadingCoupons(true);
        setCouponError("");
        const data = await fetchMyCoupons();
        if (!aborted) {
          setCoupons(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!aborted) {
          setCouponError(extractErrorMessage(error));
        }
      } finally {
        if (!aborted) {
          setLoadingCoupons(false);
        }
      }
    }

    loadCoupons();
    return () => {
      aborted = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaving(true);
    setErrorText("");
    setSuccessText("");

    try {
      const updated = await updateMyProfile({
        username: normalizedUsername,
        email: normalizedEmail || null,
      });

      setTelephone(String(updated?.telephone || ""));
      setCountryCode(String(updated?.country_code || "+86"));
      setUsername(String(updated?.username || ""));
      setEmail(String(updated?.email || ""));
      setSuccessText("资料已保存。");
      await reloadMe();
    } catch (error) {
      setErrorText(extractErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-page">
      <div className="profile-page__stack">
        <section className="profile-card">
        <div className="profile-header">
          <button
            type="button"
            className="profile-backBtn"
            onClick={() => {
              navigate(-1);
            }}
            aria-label="Back"
          >
            ‹
          </button>
          <div>
            <h1 className="profile-title">个人资料</h1>
          </div>
        </div>

        {loadingProfile ? (
          <div className="profile-stateText">加载中…</div>
        ) : (
          <form className="profile-form" onSubmit={handleSubmit}>
            <label className="profile-label">
              手机号
              <div className="profile-inputRow">
                <select
                  className="profile-input profile-select profile-input--readonly"
                  value={countryCode || user?.country_code || "+86"}
                  disabled
                >
                  {COUNTRY_CODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <input
                  className="profile-input profile-input--readonly"
                  value={telephone || user?.telephone || ""}
                  disabled
                />
              </div>
            </label>

            <label className="profile-label">
              用户名
              <input
                className="profile-input"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
                placeholder="请输入用户名"
                maxLength={15}
                autoComplete="nickname"
              />
            </label>

            <label className="profile-label">
              邮箱
              <input
                className="profile-input"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="请输入邮箱"
                autoComplete="email"
              />
            </label>

            {errorText ? <div className="profile-errorText">{errorText}</div> : null}
            {successText ? <div className="profile-successText">{successText}</div> : null}

            <button type="submit" className="profile-saveBtn" disabled={!canSave}>
              {saving ? "保存中…" : "保存资料"}
            </button>
          </form>
        )}
        </section>
        <section className="profile-couponWallet" id="coupons" aria-labelledby="coupon-wallet-title">
        <div className="profile-couponWallet__header">
          <div>
            <div className="profile-couponWallet__eyebrow">COUPON WALLET</div>
            <h2 id="coupon-wallet-title" className="profile-couponWallet__title">我的优惠券</h2>
          </div>
          <button
            type="button"
            className="profile-couponWallet__redeem"
            onClick={() => navigate("/redeem-code")}
          >
            兑换优惠券
          </button>
        </div>

        <div className="profile-couponWallet__filters" role="tablist" aria-label="优惠券状态">
          {COUPON_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={couponFilter === item.key}
              className={`profile-couponWallet__filter${couponFilter === item.key ? " is-active" : ""}`}
              onClick={() => setCouponFilter(item.key)}
            >
              {item.label}
              <span>{couponCounts[item.key] || 0}</span>
            </button>
          ))}
        </div>

        {loadingCoupons ? <div className="profile-couponWallet__state">正在加载优惠券…</div> : null}
        {!loadingCoupons && couponError ? (
          <div className="profile-couponWallet__state profile-couponWallet__state--error">{couponError}</div>
        ) : null}
        {!loadingCoupons && !couponError && filteredCoupons.length === 0 ? (
          <div className="profile-couponWallet__empty">
            <strong>暂无{COUPON_FILTERS.find((item) => item.key === couponFilter)?.label}的优惠券</strong>
          </div>
        ) : null}

        <div className="profile-couponWallet__list">
          {filteredCoupons.map((coupon) => {
            const statusKey = coupon?.effective_status || coupon?.status;
            const usageHistory = Array.isArray(coupon?.usage_history) ? coupon.usage_history : [];
            const isInactive = !["available", "reserved"].includes(statusKey);
            return (
              <article
                key={coupon.id}
                className={`profile-coupon${isInactive ? " profile-coupon--inactive" : ""}`}
              >
                <div className="profile-coupon__value">
                  <div><span>¥</span>{formatCouponAmount(coupon.discount_amount)}</div>
                  <small>
                    {Number(coupon.minimum_order_amount) > 0
                      ? `满 ¥${formatCouponAmount(coupon.minimum_order_amount)} 可用`
                      : "无门槛"}
                  </small>
                </div>
                <div className="profile-coupon__divider" aria-hidden="true" />
                <div className="profile-coupon__details">
                  <div className="profile-coupon__topline">
                    <strong>
                      {Number(coupon.minimum_order_amount) > 0 ? "满减优惠券" : "无门槛优惠券"}
                    </strong>
                    <span className={`profile-coupon__status profile-coupon__status--${statusKey}`}>
                      {COUPON_STATUS_LABELS[statusKey] || statusKey}
                    </span>
                  </div>
                  <div className="profile-coupon__meta">
                    <div className="profile-coupon__metaItem">
                      <span>适用范围</span>
                      <strong>{couponScopeLabel(coupon)}</strong>
                    </div>
                    <div className="profile-coupon__metaItem">
                      <span>有效期</span>
                      <strong>
                        {coupon.expires_at ? `至 ${formatCouponDate(coupon.expires_at)}` : "长期有效"}
                      </strong>
                    </div>
                  </div>
                  {statusKey === "available" ? (
                    <button
                      type="button"
                      className="profile-coupon__useButton"
                      onClick={() => setCouponToUse(coupon)}
                    >
                      去使用
                    </button>
                  ) : null}
                  {usageHistory.length > 0 ? (
                    <details className="profile-coupon__usage">
                      <summary>查看使用记录</summary>
                      {usageHistory.map((usage) => (
                        <div className="profile-coupon__usageItem" key={usage.merchant_order_no}>
                          <div>订单：{usage.merchant_order_no}</div>
                          <div>商品：{usage.offer_title}</div>
                          <div>优惠 ¥{usage.promotion_discount_amount} · 实付 ¥{usage.final_amount}</div>
                          <div>{usage.applied_at ? `使用于 ${formatCouponDate(usage.applied_at)}` : "订单尚未完成支付"}</div>
                        </div>
                      ))}
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        </section>
      </div>
      {couponToUse ? (
        <div className="profile-couponPicker" role="presentation">
          <button
            type="button"
            className="profile-couponPicker__backdrop"
            aria-label="关闭模块选择"
            onClick={() => setCouponToUse(null)}
          />
          <section
            className="profile-couponPicker__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-module-picker-title"
          >
            <div className="profile-couponPicker__handle" aria-hidden="true" />
            <header className="profile-couponPicker__header">
              <div>
                <div className="profile-couponPicker__eyebrow">使用优惠券</div>
                <h3 id="coupon-module-picker-title">选择想要购买的模块</h3>
                <p>选择后将进入对应模块的购买页面。</p>
              </div>
              <button
                type="button"
                className="profile-couponPicker__close"
                aria-label="关闭"
                onClick={() => setCouponToUse(null)}
              >
                ×
              </button>
            </header>
            <div className="profile-couponPicker__couponSummary">
              <strong>¥{formatCouponAmount(couponToUse.discount_amount)}</strong>
              <span>
                {Number(couponToUse.minimum_order_amount) > 0
                  ? `满 ¥${formatCouponAmount(couponToUse.minimum_order_amount)} 可用`
                  : "无门槛优惠券"}
              </span>
            </div>
            <div className="profile-couponPicker__modules">
              {couponModules.map((module) => (
                <button
                  type="button"
                  className="profile-couponPicker__module"
                  key={module.id}
                  onClick={() => navigate(`/modules/${module.id}/purchase?coupon=${couponToUse.id}`)}
                >
                  <span>
                    <strong>{module.title}</strong>
                    <small>{module.subtitle}</small>
                  </span>
                  <span className="profile-couponPicker__arrow" aria-hidden="true">→</span>
                </button>
              ))}
              {couponModules.length === 0 ? (
                <div className="profile-couponPicker__empty">当前没有可使用这张优惠券的模块。</div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
