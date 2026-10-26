import { useEffect, useMemo, useState } from "react";

import {
  fetchPromotionCampaignReport,
  fetchPromotionCampaigns,
} from "../../api/auth/profile.js";

const SUMMARY_ITEMS = [
  ["coupon_redemptions", "兑换次数"],
  ["redeeming_users", "兑换人数"],
  ["paid_orders", "购买订单"],
  ["paying_users", "购买人数"],
];

const AMOUNT_ITEMS = [
  ["original_amount", "订单原价"],
  ["promotion_discount", "优惠金额"],
  ["final_amount", "实付金额"],
];

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function errorMessage(error) {
  return String(error?.data?.detail || error?.message || "查询失败，请稍后重试。");
}

export default function PromotionCampaignReportCard() {
  const [campaignName, setCampaignName] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState("");
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [activeCampaignIndex, setActiveCampaignIndex] = useState(-1);
  const [month, setMonth] = useState(currentMonth);
  const [allTime, setAllTime] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPromotionCampaigns()
      .then((data) => {
        if (!cancelled) {
          setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : []);
        }
      })
      .catch((requestError) => {
        if (!cancelled) setCampaignsError(errorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setCampaignsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredCampaigns = useMemo(() => {
    const query = campaignName.trim().toLocaleLowerCase();
    if (!query) return campaigns;
    return campaigns.filter((name) => name.toLocaleLowerCase().includes(query));
  }, [campaignName, campaigns]);

  function selectCampaign(name) {
    setCampaignName(name);
    setCampaignsOpen(false);
    setActiveCampaignIndex(-1);
  }

  function handleCampaignKeyDown(event) {
    if (event.key === "Escape") {
      setCampaignsOpen(false);
      setActiveCampaignIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCampaignsOpen(true);
      if (filteredCampaigns.length === 0) return;
      setActiveCampaignIndex((current) => {
        if (event.key === "ArrowDown") {
          return current >= filteredCampaigns.length - 1 ? 0 : current + 1;
        }
        return current <= 0 ? filteredCampaigns.length - 1 : current - 1;
      });
      return;
    }
    if (event.key === "Enter" && campaignsOpen && activeCampaignIndex >= 0) {
      event.preventDefault();
      selectCampaign(filteredCampaigns[activeCampaignIndex]);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedCampaignName = campaignName.trim();
    if (!normalizedCampaignName || !month || loading) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      setReport(await fetchPromotionCampaignReport({
        campaignName: normalizedCampaignName,
        month: allTime ? "all" : month,
      }));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const purchases = Array.isArray(report?.purchases) ? report.purchases : [];
  const isEmpty = report
    && Number(report.coupon_redemptions) === 0
    && Number(report.paid_orders) === 0;

  return (
    <section className="profile-card profile-campaignReport" aria-labelledby="campaign-report-title">
      <h2 id="campaign-report-title" className="profile-promotionCard__title">
        合作博主优惠码统计
      </h2>
      <form className="profile-campaignReport__form" onSubmit={handleSubmit}>
        <label className="profile-label">
          合作博主
          <div
            className="profile-campaignReport__combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setCampaignsOpen(false);
                setActiveCampaignIndex(-1);
              }
            }}
          >
            <input
              className="profile-input"
              role="combobox"
              aria-expanded={campaignsOpen}
              aria-controls="promotion-campaign-options"
              aria-autocomplete="list"
              aria-activedescendant={activeCampaignIndex >= 0
                ? `promotion-campaign-option-${activeCampaignIndex}`
                : undefined}
              autoComplete="off"
              placeholder="输入或选择合作博主"
              value={campaignName}
              onFocus={() => setCampaignsOpen(true)}
              onChange={(event) => {
                setCampaignName(event.target.value);
                setCampaignsOpen(true);
                setActiveCampaignIndex(-1);
              }}
              onKeyDown={handleCampaignKeyDown}
              required
            />
            {campaignsOpen ? (
              <div
                id="promotion-campaign-options"
                className="profile-campaignReport__options"
                role="listbox"
              >
                {campaignsLoading ? <div className="profile-campaignReport__optionState">正在加载…</div> : null}
                {!campaignsLoading && filteredCampaigns.length === 0 ? (
                  <div className="profile-campaignReport__optionState">没有匹配的合作博主</div>
                ) : null}
                {filteredCampaigns.map((name, index) => (
                  <button
                    id={`promotion-campaign-option-${index}`}
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={index === activeCampaignIndex}
                    className={index === activeCampaignIndex ? "is-active" : ""}
                    onClick={() => selectCampaign(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {campaignsError ? <small className="profile-campaignReport__loadError">合作博主列表加载失败，仍可直接输入。</small> : null}
        </label>
        <div className="profile-label">
          统计时间
          <div className="profile-campaignReport__periodControl">
            <input
              aria-label="选择月份"
              className="profile-input"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              disabled={allTime}
              required={!allTime}
            />
            <label className="profile-campaignReport__allTime">
              <input
                type="checkbox"
                checked={allTime}
                onChange={(event) => setAllTime(event.target.checked)}
              />
              全部时间
            </label>
          </div>
        </div>
        <button type="submit" className="profile-saveBtn" disabled={loading}>
          {loading ? "查询中…" : "查询"}
        </button>
      </form>

      {error ? <div className="profile-errorText">{error}</div> : null}
      {isEmpty ? <div className="profile-stateText">暂无兑换或购买记录</div> : null}
      {report && !isEmpty ? (
        <>
          <div className="profile-campaignReport__summary">
            {SUMMARY_ITEMS.map(([key, label]) => (
              <div key={key} className="profile-campaignReport__metric">
                <span>{label}</span>
                <strong>{report[key]}</strong>
              </div>
            ))}
            {AMOUNT_ITEMS.map(([key, label]) => (
              <div key={key} className="profile-campaignReport__metric is-amount">
                <span>{label}</span>
                <strong>¥{report[key]}</strong>
              </div>
            ))}
          </div>

          <section className="profile-campaignReport__purchases" aria-labelledby="campaign-purchases-title">
            <div className="profile-campaignReport__sectionHeader">
              <h3 id="campaign-purchases-title">购买明细</h3>
              <span>{purchases.length} 笔</span>
            </div>
            {purchases.length === 0 ? (
              <div className="profile-stateText">暂无购买记录</div>
            ) : (
              <div className="profile-campaignReport__tableWrap">
                <table className="profile-campaignReport__table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>商品</th>
                      <th>订单</th>
                      <th>原价</th>
                      <th>优惠</th>
                      <th>实付</th>
                      <th>购买时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((purchase) => (
                      <tr key={purchase.merchant_order_no}>
                        <td data-label="用户">{purchase.telephone}</td>
                        <td data-label="商品">
                          <strong>{purchase.offer_title}</strong>
                          <small>{purchase.offer_code}</small>
                        </td>
                        <td data-label="订单">{purchase.merchant_order_no}</td>
                        <td data-label="原价">¥{purchase.original_amount}</td>
                        <td data-label="优惠">¥{purchase.promotion_discount}</td>
                        <td data-label="实付">¥{purchase.final_amount}</td>
                        <td data-label="购买时间">{formatDateTime(purchase.applied_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
