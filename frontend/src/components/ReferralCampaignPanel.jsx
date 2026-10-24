import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { fetchReferralCampaign } from "../api/referrals.js";
import "./ReferralCampaignPanel.css";

const milestoneLabels = {
  not_earned: "未达成", earned: "已获得", revoked: "已撤销",
  revocation_pending: "处理中", non_reversible: "已兑现",
};
const milestoneNames = { science_3: "科普季", vlog_5: "Vlog 季" };
const milestoneKinds = { 3: "science_3", 5: "vlog_5" };

async function copyCode(code) {
  if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
  await navigator.clipboard.writeText(code);
}

function milestoneText(milestone) {
  const status = milestone && typeof milestone === "object" ? milestone.status : null;
  return Object.hasOwn(milestoneLabels, status) ? milestoneLabels[status] : "状态更新中";
}

function formatSafeExpiry(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function historyText(item) {
  const payload = item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {};
  if (item?.event_type === "referral_qualified") {
    const days = payload.days === 30 ? "备考季 +30 天" : "备考季时长已更新";
    const count = Number.isInteger(payload.effective_count) && payload.effective_count > 0
      ? `；当前有效推广人数：${payload.effective_count}` : "";
    return `成功邀请 1 人，${days}${count}`;
  }
  if (item?.event_type === "referral_milestone_granted") {
    const name = Object.hasOwn(milestoneNames, payload.kind) ? milestoneNames[payload.kind] : "";
    const threshold = payload.threshold;
    const reward = payload.reward_type === "entitlement" ? "永久权限" : payload.reward_type === "coupon" ? "¥10 替代券" : "";
    if (name && Number.isInteger(threshold) && milestoneNames[threshold === 3 ? "science_3" : "vlog_5"] === name
      && [3, 5].includes(threshold) && reward) {
      return `已达成 ${threshold} 人里程碑，${name}${reward}已自动发放`;
    }
    return "里程碑奖励状态已更新";
  }
  if (item?.event_type === "referral_refunded") {
    const progress = payload.progress_removed === true ? "推广进度已回退" : "退款已处理";
    const days = typeof payload.days_removed === "number" && Number.isFinite(payload.days_removed)
      && payload.days_removed >= 0 && payload.days_removed <= 30
      ? `，备考季减少 ${payload.days_removed} 天` : "";
    const expiry = formatSafeExpiry(payload.access_expires_at);
    const count = Number.isInteger(payload.effective_count) && payload.effective_count >= 0
      && payload.effective_count <= 1_000_000
      ? `，当前有效推广人数：${payload.effective_count}` : "";
    const changes = Array.isArray(payload.milestone_changes)
      ? payload.milestone_changes.map(refundMilestoneText).filter(Boolean) : [];
    return `${progress}${days}${expiry ? `，当前有效期至 ${expiry}` : ""}${count}${changes.length ? `；${changes.join("；")}` : ""}`;
  }
  return "";
}

function refundMilestoneText(change) {
  if (!change || typeof change !== "object" || Array.isArray(change)
    || !Object.hasOwn(milestoneKinds, change.threshold)
    || milestoneKinds[change.threshold] !== change.kind
    || !Object.hasOwn(milestoneNames, change.kind)) return "";
  const name = milestoneNames[change.kind];
  if (change.outcome === "revoked" && change.reward_type === "entitlement") {
    return `${name}永久权限已撤销`;
  }
  if (change.outcome === "revoked" && change.reward_type === "coupon") {
    return `未使用的${name} ¥10 替代券已撤销`;
  }
  if (change.outcome === "revocation_pending" && change.reward_type === "coupon") {
    return `${name} ¥10 替代券正在订单中，待订单结束后处理`;
  }
  if (change.outcome === "non_reversible" && change.reward_type === "coupon") {
    return `${name} ¥10 替代券已使用，无法追回，该里程碑已兑现`;
  }
  return "";
}

export default function ReferralCampaignPanel() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchReferralCampaign();
      setSnapshot(result && typeof result === "object" ? result : {});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCopy() {
    try {
      await copyCode(snapshot.code);
      setFeedback("已复制推广码");
    } catch {
      setFeedback("复制失败，请手动复制推广码");
    }
  }

  async function handleShare() {
    const text = `${snapshot.campaign.name}：使用我的推广码 ${snapshot.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: snapshot.campaign.name, text });
        setFeedback("分享已打开");
        return;
      } catch (shareError) {
        if (shareError?.name === "AbortError") return;
      }
    }
    try {
      await copyCode(text);
      setFeedback("分享内容已复制");
    } catch {
      setFeedback("分享失败，请稍后重试");
    }
  }

  async function handleUnlock() {
    const result = await Swal.fire({
      text: "获得备考季权限后即可解锁推广系统。",
      showCancelButton: true,
      confirmButtonText: "前往购买",
      cancelButtonText: "取消",
    });
    if (result.isConfirmed) navigate("/modules/exam-preparation/purchase");
  }

  if (loading) return <section className="referral-panel" aria-label="推广活动"><p>正在加载推广活动…</p></section>;
  if (error) return <section className="referral-panel" aria-label="推广活动"><p>推广活动加载失败。</p><button type="button" onClick={load}>重试</button></section>;
  if (snapshot.enabled === false) return <section className="referral-panel referral-panel--disabled" aria-labelledby="referral-title"><h2 id="referral-title">推广活动</h2><p>活动暂未开放</p></section>;
  if (snapshot.locked === true || snapshot.eligible === false) return (
    <section className="referral-panel referral-panel--locked" aria-labelledby="referral-title">
      <h2 id="referral-title">推广活动</h2><p>获得备考季权限后解锁专属推广码与进度。</p>
      <button type="button" onClick={handleUnlock}>解锁推广系统</button>
    </section>
  );

  const campaignName = typeof snapshot.campaign?.name === "string" ? snapshot.campaign.name : "";
  const code = typeof snapshot.code === "string" ? snapshot.code.trim() : "";
  if (snapshot.enabled !== true || snapshot.eligible !== true || !campaignName || !code) {
    return <section className="referral-panel" aria-labelledby="referral-title"><h2 id="referral-title">推广活动</h2><p>推广信息暂不可用。</p></section>;
  }
  const count = Number.isFinite(Number(snapshot.effective_count)) ? Math.max(0, Math.floor(Number(snapshot.effective_count))) : 0;
  const milestones = snapshot.milestones && typeof snapshot.milestones === "object" ? snapshot.milestones : {};
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  return (
    <section className="referral-panel" aria-labelledby="referral-title">
      <header className="referral-panel__header"><div><h2 id="referral-title">{campaignName}</h2><p>每成功推广 1 人，备考季 +30 天</p></div><div className="referral-panel__total"><strong className="referral-panel__count">已成功推广 {count} 人</strong></div></header>
      <div className="referral-panel__code"><code>{code}</code><button type="button" onClick={handleCopy}>复制推广码</button><button type="button" onClick={handleShare}>分享</button></div>
      <div className="referral-panel__track" role="list" aria-label={`${count} 位成功推广用户`}>
        {Array.from({ length: 5 }, (_, index) => <div key={index} role="listitem" aria-label={`${index + 1} 人${count > index ? "已完成" : "未完成"}`} className={`referral-panel__node${count > index ? " is-complete" : ""}${index === 2 || index === 4 ? " referral-panel__node--milestone" : ""}`}><span>{index + 1}</span></div>)}
      </div>
      {count > 5 ? <p className="referral-panel__overflow">已成功推广 {count} 人，五个进度节点均已点亮</p> : null}
      <div className="referral-panel__rewards"><div><strong>3 人 · 科普季</strong><span>{milestoneText(milestones.science_3)}</span><small>永久权限或 ¥10 替代券</small></div><div><strong>5 人 · Vlog 季</strong><span>{milestoneText(milestones.vlog_5)}</span><small>永久权限或 ¥10 替代券</small></div></div>
      <p className="referral-panel__automatic">奖励自动发放</p>
      {history.some((item) => historyText(item)) ? <ol className="referral-panel__history" aria-label="推广记录">{history.map((item) => ({ item, text: historyText(item) })).filter(({ text }) => text).map(({ item, text }) => <li key={item.id ?? `${item.event_type}-${item.created_at ?? "unknown"}`}><span>{text}</span><time>{item.created_at && !Number.isNaN(Date.parse(item.created_at)) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at)) : "日期未知"}</time></li>)}</ol> : null}
      <div className="referral-panel__feedback" role="status" aria-live="polite">{feedback}</div>
    </section>
  );
}
