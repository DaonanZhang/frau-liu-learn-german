import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../api/auth/useAuth.js";
import {
  clearPendingPaymentContext,
  fetchAlipayPaymentStatus,
  loadPendingPaymentContext,
} from "../api/payments/alipay.js";
import { MODULES_BY_ID } from "./Homepage/homeShared.js";

import "./AlipayReturnPage.css";

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildLoadingState({
  title,
  detail,
  attempt = 0,
}) {
  return {
    phase: "loading",
    title,
    detail,
    attempt,
  };
}

export default function AlipayReturnPage() {
  const navigate = useNavigate();
  const { reloadMe } = useAuth();
  const [searchParams] = useSearchParams();
  const [retryToken, setRetryToken] = useState(0);
  const [pageState, setPageState] = useState(() => buildLoadingState({
    title: "正在确认支付结果",
    detail: "支付完成后正在同步订单与权限，请在加载结束前不要关闭此页面。",
  }));

  const merchantOrderNo = useMemo(
    () => String(
      searchParams.get("out_trade_no")
      || searchParams.get("merchant_order_no")
      || ""
    ).trim(),
    [searchParams],
  );

  const context = useMemo(
    () => (merchantOrderNo ? loadPendingPaymentContext(merchantOrderNo) : null),
    [merchantOrderNo],
  );

  const targetPath = useMemo(() => {
    const moduleId = String(context?.moduleId || "").trim();
    if (moduleId && MODULES_BY_ID[moduleId]?.route) {
      return MODULES_BY_ID[moduleId].route;
    }
    return context?.returnPath || "/";
  }, [context]);

  useEffect(() => {
    let cancelled = false;
    let redirectTimer = null;

    async function handleReturn() {
      if (!merchantOrderNo) {
        setPageState({
          phase: "error",
          title: "支付结果获取失败",
          detail: "未找到订单号，无法自动确认本次支付结果。",
          attempt: 0,
        });
        return;
      }

      let lastKnownPaid = false;
      let lastKnownGranted = false;

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) {
          return;
        }

        if (attempt === 0) {
          setPageState(buildLoadingState({
            title: "正在确认支付结果",
            detail: "支付完成后正在同步订单与权限，请在加载结束前不要关闭此页面。",
            attempt,
          }));
        }

        try {
          const status = await fetchAlipayPaymentStatus(merchantOrderNo);
          lastKnownPaid = Boolean(status?.is_paid);
          lastKnownGranted = Boolean(status?.is_granted);

          if (lastKnownPaid && lastKnownGranted) {
            clearPendingPaymentContext(merchantOrderNo);
            await reloadMe();
            if (cancelled) {
              return;
            }
            setPageState({
              phase: "success",
              title: "支付成功",
              detail: "权限已经开通，正在为你跳转。",
              attempt: attempt + 1,
            });
            redirectTimer = window.setTimeout(() => {
              navigate(targetPath, { replace: true });
            }, 1200);
            return;
          }

          if (status?.is_failed) {
            clearPendingPaymentContext(merchantOrderNo);
            setPageState({
              phase: "error",
              title: "支付未完成",
              detail: "系统尚未确认本次订单成功支付，请稍后重试或联系客服处理。",
              attempt: attempt + 1,
            });
            return;
          }

          if (lastKnownPaid) {
            setPageState(buildLoadingState({
              title: "支付已确认，正在开通权限",
              detail: "订单已支付成功，系统正在完成权限同步。请继续等待，不要关闭此页面。",
              attempt: attempt + 1,
            }));
          } else {
            setPageState(buildLoadingState({
              title: "正在等待支付确认",
              detail: "如果你刚刚完成支付，系统可能还需要一点时间同步结果。请暂时不要关闭此页面。",
              attempt: attempt + 1,
            }));
          }
        } catch {
          setPageState(buildLoadingState({
            title: "正在重试确认支付结果",
            detail: "当前网络或支付网关响应较慢，系统会继续自动重试。请不要关闭此页面。",
            attempt: attempt + 1,
          }));
        }

        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          await sleep(POLL_INTERVAL_MS);
        }
      }

      if (cancelled) {
        return;
      }

      setPageState({
        phase: "pending",
        title: lastKnownPaid ? "支付已成功，权限仍在同步中" : "支付结果仍在确认中",
        detail: lastKnownPaid
          ? "订单大概率已经成功，关闭本页不会影响到账。你可以稍后重试，或先返回课程页面刷新查看。"
          : "当前未能在短时间内确认支付结果。这通常是网络或支付网关响应慢导致的，不代表支付失败。",
        attempt: MAX_POLL_ATTEMPTS,
      });
    }

    handleReturn();

    return () => {
      cancelled = true;
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, [merchantOrderNo, navigate, reloadMe, retryToken, targetPath]);

  const isLoading = pageState.phase === "loading";
  const canRetry = pageState.phase === "pending" || pageState.phase === "error";
  const primaryButtonLabel = pageState.phase === "success" ? "立即进入课程" : "返回课程";

  return (
    <main className="alipay-return-page">
      <section className="alipay-return-page__card">
        <div className={`alipay-return-page__status alipay-return-page__status--${pageState.phase}`}>
          {isLoading ? <div className="alipay-return-page__spinner" aria-hidden="true" /> : null}
          {!isLoading ? (
            <div className="alipay-return-page__badge">
              {pageState.phase === "success" ? "已完成" : pageState.phase === "pending" ? "处理中" : "异常"}
            </div>
          ) : null}
        </div>

        <p className="alipay-return-page__eyebrow">支付宝支付结果</p>
        <h1 className="alipay-return-page__title">{pageState.title}</h1>
        <p className="alipay-return-page__detail">{pageState.detail}</p>

        {merchantOrderNo ? (
          <div className="alipay-return-page__meta">
            <span>订单号</span>
            <strong>{merchantOrderNo}</strong>
          </div>
        ) : null}

        {isLoading ? (
          <div className="alipay-return-page__hint">
            请保持当前页面开启，直到系统完成支付确认和权限开通。
          </div>
        ) : null}

        <div className="alipay-return-page__actions">
          <button
            className="alipay-return-page__button alipay-return-page__button--primary"
            type="button"
            onClick={() => {
              navigate(targetPath, { replace: true });
            }}
          >
            {primaryButtonLabel}
          </button>

          {canRetry ? (
            <button
              className="alipay-return-page__button alipay-return-page__button--secondary"
              type="button"
              onClick={() => {
                setRetryToken((value) => value + 1);
              }}
            >
              重新确认支付状态
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
