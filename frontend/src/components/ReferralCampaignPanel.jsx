import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchReferralCampaign } from "../api/referrals.js";
import { examPreparationPurchasePath } from "../utils/examPreparationScope.js";
import "./ReferralCampaignPanel.css";

const milestoneNames = { science_3: "科普季", vlog_5: "Vlog 季" };
const milestoneKinds = { 3: "science_3", 5: "vlog_5" };

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
  const [copiedAction, setCopiedAction] = useState(null);
  const [showFollowUpTooltip, setShowFollowUpTooltip] = useState(false);
  const feedbackTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const copiedActionKeyRef = useRef(0);
  const code = typeof snapshot?.code === "string" ? snapshot.code.trim() : "";
  const invitationText = `强烈推荐大家试试【符号刘德语备考一站式平台】！
🌐 网站：www.frauliu.com (中国IP) / www.frauliu.cn (海外IP)
我正在用它高效复习备考！
🎁 输入我的专属分享码: 【${code}】 即刻享受立减 5 元的专属折扣！
快来和我一起上岸吧！Viel Erfolg bei der Prüfung!`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

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

  function showCopied(action) {
    if (!mountedRef.current) return;
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setCopiedAction({ action, key: ++copiedActionKeyRef.current });
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      if (mountedRef.current) {
        setCopiedAction(null);
      }
    }, 1800);
  }

  async function handleCopy() {
    try {
      await copyCode(code);
      showCopied("copy");
      setFeedback("");
    } catch {
      setCopiedAction(null);
      setFeedback("复制失败，请手动复制推广码");
    }
  }

  async function handleShare() {
    try {
      await copyCode(invitationText);
      showCopied("share");
      setFeedback("");
    } catch {
      setCopiedAction(null);
      setFeedback("分享失败，请稍后重试");
    }
  }

  function handleUnlock() {
    navigate(examPreparationPurchasePath(null));
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
        <div className="referral-panel__locked-content">
          <span className="referral-panel__locked-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              <circle cx="12" cy="15" r="1" />
            </svg>
          </span>
          <h2 id="referral-title">解锁备考季</h2>
          <p>购买备考季后，即可获得专属推荐码并参与邀请奖励。</p>
          <button className="referral-panel__locked-cta" type="button" onClick={handleUnlock}>
            解锁备考季
          </button>
        </div>
      </section>
    );
  }

  const campaignName = typeof snapshot.campaign?.name === "string" ? snapshot.campaign.name : "";
  if (snapshot.enabled !== true || snapshot.eligible !== true || !campaignName || !code) {
    return <section className="referral-panel" aria-labelledby="referral-title"><h2 id="referral-title">推广活动</h2><p>推广信息暂不可用。</p></section>;
  }
  const count = Number.isFinite(Number(snapshot.effective_count)) ? Math.max(0, Math.floor(Number(snapshot.effective_count))) : 0;
  const history = Array.isArray(snapshot.history) ? snapshot.history : [];
  const nodes = [1, 2, 3, 4, 5, "++"];
  const progressPercent = Math.min(Math.max(count - 1, 0), 5) * 20;
  return (
    <section className="referral-panel" aria-labelledby="referral-title">
      <header className="referral-panel__header">
        <h2 id="referral-title">邀请好友，共享好课</h2>
        <p>邀请好友下单，双方均享丰富福利</p>
      </header>
      <div className="referral-panel__code">
        <div className="referral-panel__code-heading">
          <h3>专属推荐码</h3>
          <p>好友使用推荐码下单，立减 5 元</p>
        </div>
        <div className="referral-panel__code-row">
          <div className="referral-panel__code-frame"><code>{code}</code></div>
          <button className="referral-panel__code-copy" type="button" onClick={handleCopy} aria-label={copiedAction?.action === "copy" ? "复制，已复制" : "复制"}>
            <span className={copiedAction?.action === "copy" ? "referral-panel__action-content is-copied" : "referral-panel__action-content"}>复制</span>
            <span key={copiedAction?.action === "copy" ? copiedAction.key : "copy-feedback"} className={`referral-panel__copy-feedback${copiedAction?.action === "copy" ? " is-visible" : ""}`} aria-hidden={copiedAction?.action !== "copy"}>已复制</span>
          </button>
        </div>
        <div className="referral-panel__share-copy">
          <h3>快速分享文案</h3>
          <p>{invitationText}</p>
          <button className="referral-panel__share-button" type="button" onClick={handleShare} aria-label={copiedAction?.action === "share" ? "一键复制完整文案，已复制" : "一键复制完整文案"}>
            <span className={copiedAction?.action === "share" ? "referral-panel__action-content is-copied" : "referral-panel__action-content"}>一键复制完整文案</span>
            <span key={copiedAction?.action === "share" ? copiedAction.key : "share-feedback"} className={`referral-panel__copy-feedback${copiedAction?.action === "share" ? " is-visible" : ""}`} aria-hidden={copiedAction?.action !== "share"}>已复制</span>
          </button>
        </div>
      </div>
      <section className="referral-panel__progress" aria-labelledby="referral-progress-title">
        <h3 id="referral-progress-title">邀请进度与奖励</h3>
        <div className="referral-panel__track" role="list" aria-label={`${count} 位成功邀请用户`}>
          <span className="referral-panel__track-line" aria-hidden="true">
            <span className="referral-panel__track-fill" style={{ width: `${progressPercent}%` }} />
          </span>
          {nodes.map((node) => {
            const isFollowUp = node === "++";
            const isComplete = isFollowUp ? count > 5 : count >= node;
            const isMilestone = node === 3 || node === 5;
            const nodeLabel = isFollowUp ? "后续奖励" : `节点 ${node}`;
            return (
              <div className={`referral-panel__step${isFollowUp ? " referral-panel__step--follow-up" : ""}`} key={node} role="listitem" aria-label={`${nodeLabel}：${isComplete ? "已完成" : "未完成"}`}>
                {isFollowUp ? (
                  <>
                    <button
                      className={`referral-panel__node referral-panel__node--follow-up${isComplete ? " is-complete" : ""}`}
                      type="button"
                      aria-label={`${nodeLabel}：${isComplete ? "已完成" : "未完成"}`}
                      aria-describedby="referral-follow-up-tooltip"
                      aria-expanded={showFollowUpTooltip}
                      onMouseEnter={() => setShowFollowUpTooltip(true)}
                      onMouseLeave={() => setShowFollowUpTooltip(false)}
                      onFocus={() => setShowFollowUpTooltip(true)}
                      onBlur={() => setShowFollowUpTooltip(false)}
                      onClick={() => setShowFollowUpTooltip(true)}
                    >
                      {node}
                    </button>
                  </>
                ) : (
                  <span className={`referral-panel__node${isComplete ? " is-complete" : ""}${isMilestone ? " referral-panel__node--milestone" : ""}`} aria-hidden="true">
                    {node}
                    {isComplete ? <span className="referral-panel__completion-mark" aria-hidden="true">✓</span> : null}
                  </span>
                )}
                {node === 3 ? <span className="referral-panel__milestone-label">解锁科普季</span> : null}
                {node === 5 ? <span className="referral-panel__milestone-label">解锁 Vlog季</span> : null}
              </div>
            );
          })}
        </div>
        <div className="referral-panel__current-count">
          <div className="referral-panel__current-count-value" aria-live="polite" aria-atomic="true">当前已成功邀请：<strong>{count}</strong> 人</div>
          <p className="referral-panel__current-count-prompt">赶快分享给好友，解锁丰厚备考福利吧！</p>
        </div>
        <div className="referral-panel__rules">
          <h4>奖励规则：</h4>
          <ul>
            <li>每推荐 1 人成功下单备考季，您的备考季自动延长 1 个月（可叠加）。</li>
            <li>推荐达 3 人，额外赠送「科普季」权限。</li>
            <li>推荐达 5 人，额外再赠送「Vlog季」权限。</li>
          </ul>
        </div>
      </section>
      {history.some((item) => historyText(item)) ? <ol className="referral-panel__history" aria-label="推广记录">{history.map((item) => ({ item, text: historyText(item) })).filter(({ text }) => text).map(({ item, text }) => <li key={item.id ?? `${item.event_type}-${item.created_at ?? "unknown"}`}><span>{text}</span><time>{item.created_at && !Number.isNaN(Date.parse(item.created_at)) ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.created_at)) : "日期未知"}</time></li>)}</ol> : null}
      <div className="referral-panel__feedback" role="status" aria-live="polite">{feedback}</div>
    </section>
  );
}
