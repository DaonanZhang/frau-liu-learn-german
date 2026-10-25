import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchReferralCampaign } from "../api/referrals.js";
import { examPreparationPurchasePath } from "../utils/examPreparationScope.js";
import "./ReferralCampaignPanel.css";

const milestoneNames = { science_3: "科普季", vlog_5: "Vlog 季" };
const milestoneKinds = { 3: "science_3", 5: "vlog_5" };
const rewardIllustrationPath = "/images/exam-referral/reward_30_days.png";

async function copyCode(code) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("clipboard unavailable");
  }
  await navigator.clipboard.writeText(code);
}

function formatSafeExpiry(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return "";
  }
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
    || !Object.hasOwn(milestoneNames, change.kind)) {
    return "";
  }
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
  const [selectedNode, setSelectedNode] = useState(1);
  const [previewNode, setPreviewNode] = useState(null);

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
        if (shareError?.name === "AbortError") {
          return;
        }
      }
    }
    try {
      await copyCode(text);
      setFeedback("分享内容已复制");
    } catch {
      setFeedback("分享失败，请稍后重试");
    }
  }

  function handleUnlock() {
    navigate(examPreparationPurchasePath(null));
  }

  function handleNodeSelect(node) {
    setSelectedNode(node);
    setPreviewNode(null);
  }

  function canPreviewPointer(event) {
    return event.pointerType !== "touch" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true;
  }

  function handlePointerEnter(event, node) {
    if (canPreviewPointer(event)) {
      setPreviewNode(node);
    }
  }

  function handlePointerLeave(event) {
    if (canPreviewPointer(event)) {
      setPreviewNode(null);
    }
  }

  function handleTouchPreview(event, node) {
    if (event.pointerType === "touch") {
      setPreviewNode(node);
    }
  }

  function clearTouchPreview(event) {
    if (event.pointerType === "touch") {
      setPreviewNode(null);
    }
  }

  if (loading) {
    return <section className="referral-panel" aria-label="推广活动"><p>正在加载推广活动…</p></section>;
  }
  if (error) {
    return <section className="referral-panel" aria-label="推广活动"><p>推广活动加载失败。</p><button type="button" onClick={load}>重试</button></section>;
  }
  if (snapshot.enabled === false) {
    return <section className="referral-panel referral-panel--disabled" aria-labelledby="referral-title"><h2 id="referral-title">推广活动</h2><p>活动暂未开放</p></section>;
  }
  if (snapshot.locked === true || snapshot.eligible === false) {
    return (
      <section className="referral-panel referral-panel--locked" aria-labelledby="referral-title">
        <img
          className="referral-panel__locked-student"
          src="/images/exam-referral/locked-student.png"
          alt=""
        />
        <div className="referral-panel__locked-content">
          <div className="referral-panel__locked-cloud">
            <img
              className="referral-panel__locked-sparkles"
              src="/images/exam-referral/locked-sparkles.svg"
              alt=""
            />
            <h2 id="referral-title">暂未解锁推广系统</h2>
          </div>
          <p>获得备考季权限后即可解锁推广系统。</p>
          <button className="referral-panel__locked-cta" type="button" onClick={handleUnlock}>
            <img src="/images/exam-referral/locked-lock.svg" alt="" />
            <span>解锁备考季</span>
          </button>
        </div>
        <img
          className="referral-panel__locked-books"
          src="/images/exam-referral/locked-books.png"
          alt=""
        />
      </section>
    );
  }

  const campaignName = typeof snapshot.campaign?.name === "string" ? snapshot.campaign.name : "";
  const code = typeof snapshot.code === "string" ? snapshot.code.trim() : "";
  if (snapshot.enabled !== true || snapshot.eligible !== true || !campaignName || !code) {
    return <section className="referral-panel" aria-labelledby="referral-title"><h2 id="referral-title">推广活动</h2><p>推广信息暂不可用。</p></section>;
  }
  const count = Number.isFinite(Number(snapshot.effective_count)) ? Math.max(0, Math.floor(Number(snapshot.effective_count))) : 0;
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const nodes = [1, 2, 3, 4, 5, "++"];
  const displayedNode = previewNode ?? selectedNode;
  const selectedNodeNumber = displayedNode === "++" ? "后续" : displayedNode;
  const selectedNodeLabel = selectedNodeNumber === "后续" ? "后续奖励详情" : `节点 ${selectedNodeNumber} 奖励详情`;
  const completedConnectionCount = Math.min(Math.max(count - 1, 0), 5);
  const rewardCardClassName = `referral-panel__reward-card${[1, 2, 4].includes(displayedNode) ? " referral-panel__reward-card--single" : ""}`;
  return (
    <section className="referral-panel" aria-labelledby="referral-title">
      <header className="referral-panel__header"><h2 id="referral-title">{campaignName}</h2></header>
      <div className="referral-panel__code">
        <div className="referral-panel__code-label">
          <span className="referral-panel__code-ticket" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2.5 2.5 0 0 0 0-5v-2Z" />
              <path d="M13 8.5v1m0 2v1m0 2v1" />
            </svg>
          </span>
          <span>我的专属推广码</span>
        </div>
        <div className="referral-panel__code-row">
          <code>{code}</code>
          <div className="referral-panel__code-actions">
            <button className="referral-panel__code-copy" type="button" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
              <span>复制</span>
            </button>
            <button className="referral-panel__code-share" type="button" onClick={handleShare}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
              </svg>
              <span>邀请好友</span>
            </button>
          </div>
        </div>
      </div>
      <div className="referral-panel__progress is-open">
        <div className="referral-panel__track" role="list" aria-label={`${count} 位成功推广用户`}>
          <span className="referral-panel__track-line" aria-hidden="true">
            <span className={`referral-panel__track-fill referral-panel__track-fill--${completedConnectionCount}`} />
          </span>
          {nodes.map((node) => {
            const isFollowUp = node === "++";
            const isComplete = isFollowUp ? count > 5 : count >= node;
            const isMilestone = node === 3 || node === 5;
            const nodeLabel = isFollowUp ? "后续节点" : `节点 ${node}`;
            return (
              <div className="referral-panel__step" key={node} role="listitem">
                <button
                  type="button"
                  className={`referral-panel__node${isComplete ? " is-complete" : ""}${isMilestone ? " referral-panel__node--milestone" : ""}${isFollowUp ? " referral-panel__node--follow-up" : ""}${displayedNode === node ? " is-selected" : ""}`}
                  aria-label={`${nodeLabel}：${isComplete ? "已完成" : "未完成"}`}
                  aria-expanded={displayedNode === node}
                  aria-current={displayedNode === node ? "step" : undefined}
                  onClick={() => handleNodeSelect(node)}
                  onFocus={() => setPreviewNode(node)}
                  onBlur={() => setPreviewNode(null)}
                  onPointerEnter={(event) => handlePointerEnter(event, node)}
                  onPointerLeave={handlePointerLeave}
                  onPointerDown={(event) => handleTouchPreview(event, node)}
                  onPointerUp={clearTouchPreview}
                  onPointerCancel={clearTouchPreview}
                >
                  <span className="referral-panel__node-label" aria-hidden="true">{node}</span>
                  {isComplete ? <span className="referral-panel__completion-mark" aria-hidden="true">✓</span> : null}
                </button>
              </div>
            );
          })}
        </div>
        <aside className={rewardCardClassName} role="region" aria-label={selectedNodeLabel}>
          <div className="referral-panel__reward-images">
            <img className="referral-panel__reward-illustration" src={rewardIllustrationPath} alt="备考季 +30 天漫画奖励" />
          </div>
          <div className="referral-panel__reward-copy">
            {displayedNode !== "++" ? <strong className="referral-panel__visually-hidden">备考季 +30 天</strong> : null}
            {(displayedNode === 3 || displayedNode === 5) ? <img className="referral-panel__season-cover" src={displayedNode === 3 ? "/images/1.png" : "/images/2.png"} alt={displayedNode === 3 ? "科普季" : "Vlog 季"} /> : null}
            {displayedNode === 3 ? <span>赠送科普季</span> : null}
            {displayedNode === 5 ? <span>赠送 Vlog 季</span> : null}
            {displayedNode === "++" ? <><strong>此后每推广一人，仍可获得备考季继续 +30 天哦！</strong>{count > 5 ? <small>已获得后续奖励 {count - 5} 次</small> : null}</> : null}
          </div>
        </aside>
      </div>
      {history.some((item) => historyText(item)) ? <ol className="referral-panel__history" aria-label="推广记录">{history.map((item) => ({ item, text: historyText(item) })).filter(({ text }) => text).map(({ item, text }) => <li key={item.id ?? `${item.event_type}-${item.created_at ?? "unknown"}`}><span>{text}</span><time>{item.created_at && !Number.isNaN(Date.parse(item.created_at)) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at)) : "日期未知"}</time></li>)}</ol> : null}
      <div className="referral-panel__feedback" role="status" aria-live="polite">{feedback}</div>
    </section>
  );
}
