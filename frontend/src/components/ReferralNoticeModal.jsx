import { useCallback, useEffect, useRef, useState } from "react";
import { acknowledgeReferralNotice, fetchUnreadReferralNotices } from "../api/referrals.js";
import "./ReferralNoticeModal.css";

function safeCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= 1000000 ? value : null;
}

function safeDays(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 30 ? value : 0;
}

function safeExpiry(value) {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function milestoneCopy(change) {
  if (!change || typeof change !== "object") return null;
  const season = change.threshold === 3 && change.kind === "science_3"
    ? "科普季"
    : change.threshold === 5 && change.kind === "vlog_5" ? "Vlog 季" : null;
  if (!season) return null;
  if (change.outcome === "revoked" && change.reward_type === "entitlement") return `${season}永久权限已撤销`;
  if (change.outcome === "revoked" && change.reward_type === "coupon") return `未使用的${season} ¥10 替代券已撤销`;
  if (change.outcome === "revocation_pending" && change.reward_type === "coupon") return `${season} ¥10 替代券正在订单中，待订单结束后处理`;
  if (change.outcome === "non_reversible" && change.reward_type === "coupon") return `${season} ¥10 替代券已使用，无法追回，该里程碑已兑现`;
  return null;
}

function noticeDetails(notice) {
  const payload = notice?.payload && typeof notice.payload === "object" ? notice.payload : {};
  const days = safeDays(payload.days_removed);
  const expiry = safeExpiry(payload.access_expires_at);
  const count = safeCount(payload.effective_count);
  const changes = Array.isArray(payload.milestone_changes) ? payload.milestone_changes.map(milestoneCopy).filter(Boolean) : [];
  return { days, expiry, count, changes };
}

export default function ReferralNoticeModal() {
  const [notices, setNotices] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [ackError, setAckError] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [loading, setLoading] = useState(true);
  const previousFocus = useRef(null);
  const confirmRef = useRef(null);
  const acknowledgementLock = useRef(false);
  const active = notices.length > 0;
  const activeNoticeId = notices[0]?.id;

  const loadNotices = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await fetchUnreadReferralNotices();
      const safeNotices = Array.isArray(result) ? result.filter((item) => item
        && item.event_type === "referral_refunded"
        && item.is_global_notice === true
        && item.acknowledged_at == null
        && Number.isSafeInteger(item.id)
        && item.id > 0) : [];
      if (safeNotices.length) previousFocus.current = document.activeElement;
      setNotices(safeNotices);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadNotices(); }, [loadNotices]);

  useEffect(() => {
    if (!active) return undefined;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();
    const trapFocus = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".referral-notice__dialog");
      const buttons = dialog?.querySelectorAll("button") ?? [];
      if (buttons.length === 1) {
        event.preventDefault();
        buttons[0].focus();
      } else if (buttons.length > 1) {
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!dialog.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = oldOverflow;
    };
  }, [active, activeNoticeId, ackError]);

  useEffect(() => {
    if (!active && !loading && !loadError && previousFocus.current?.isConnected) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [active, loading, loadError]);

  const acknowledge = async () => {
    const notice = notices[0];
    if (!notice || acknowledgementLock.current) return;
    acknowledgementLock.current = true;
    setAcknowledging(true);
    setAckError(false);
    try {
      await acknowledgeReferralNotice(notice.id);
      setNotices((current) => current.slice(1));
    } catch {
      setAckError(true);
    } finally {
      acknowledgementLock.current = false;
      setAcknowledging(false);
    }
  };

  if (loading || (!active && !loadError)) return null;
  if (!active && loadError) {
    return <div className="referral-notice__load-error" role="alert">
      <span>推广奖励通知暂时无法加载。</span>
      <button type="button" onClick={() => { void loadNotices(); }}>重试</button>
    </div>;
  }

  const details = noticeDetails(notices[0]);
  const expiry = details.expiry ? `，当前可用期限至 ${details.expiry}` : "";
  return (
    <div className="referral-notice__overlay">
      <section className="referral-notice__dialog" role="dialog" aria-modal="true" aria-labelledby="referral-notice-title" aria-describedby="referral-notice-description" aria-busy={acknowledging}>
        <h2 id="referral-notice-title">推广奖励更新</h2>
        <div id="referral-notice-description" className="referral-notice__content">
          <p>一笔通过推广码购买的备考季订单已全额退款。</p>
          <p>{notices[0].payload?.progress_removed === true
            ? "本次退款已移除一位有效推广，推广进度已回退。"
            : notices[0].payload?.progress_removed === false
              ? "本次退款未移除有效推广，推广进度未回退。"
              : "本次退款的推广进度变动暂不可用。"}</p>
          <p>{details.count == null ? "当前有效推广人数暂不可用。" : `当前有效推广人数：${details.count}`}</p>
          {details.days > 0 ? <p>本次减少 {new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(details.days)} 天{expiry}。</p> : <p>本次未缩短当前可用期限。</p>}
          {details.changes.length > 0 && <ul>{details.changes.map((copy, index) => <li key={`${index}-${copy}`}>{copy}</li>)}</ul>}
        </div>
        {ackError && <p className="referral-notice__error" role="alert">确认失败，请重试。</p>}
        <button ref={confirmRef} className="referral-notice__confirm" type="button" onClick={acknowledge} disabled={acknowledging}>
          {acknowledging ? "处理中…" : "我知道了"}
        </button>
      </section>
    </div>
  );
}
