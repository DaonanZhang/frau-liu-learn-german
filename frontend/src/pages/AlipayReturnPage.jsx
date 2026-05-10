import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";

import { useAuth } from "../api/auth/useAuth.js";
import {
  clearPendingPaymentContext,
  fetchAlipayPaymentStatus,
  loadPendingPaymentContext,
} from "../api/payments/alipay.js";

const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function AlipayReturnPage() {
  const navigate = useNavigate();
  const { reloadMe } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    async function handleReturn() {
      const merchantOrderNo = String(
        searchParams.get("out_trade_no") ||
        searchParams.get("merchant_order_no") ||
        ""
      ).trim();
      const context = merchantOrderNo ? loadPendingPaymentContext(merchantOrderNo) : null;
      const returnPath = context?.returnPath || "/";

      if (!merchantOrderNo) {
        await Swal.fire({
          icon: "error",
          title: "支付结果获取失败",
          text: "未找到订单号，正在返回。",
        });
        if (!cancelled) {
          navigate(returnPath, { replace: true });
        }
        return;
      }

      let lastStatus = null;

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        try {
          const status = await fetchAlipayPaymentStatus(merchantOrderNo);
          lastStatus = status || null;

          if (status?.is_paid && status?.is_granted) {
            clearPendingPaymentContext(merchantOrderNo);
            await reloadMe();
            await Swal.fire({
              icon: "success",
              title: "支付成功",
              text: "对应模块权限已解锁。",
            });
            if (!cancelled) {
              navigate(returnPath, { replace: true });
            }
            return;
          }

          if (status?.is_failed) {
            clearPendingPaymentContext(merchantOrderNo);
            await Swal.fire({
              icon: "error",
              title: "支付失败",
              text: "订单未完成支付，请稍后再试。",
            });
            if (!cancelled) {
              navigate(returnPath, { replace: true });
            }
            return;
          }
        } catch {
          // keep polling briefly; async notify may still be in flight
        }

        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          await sleep(POLL_INTERVAL_MS);
        }
      }

      if (lastStatus?.is_paid || lastStatus?.is_pending_grant) {
        await Swal.fire({
          icon: "info",
          title: "支付已确认",
          text: "订单支付已成功，权限正在开通中，请稍后刷新页面确认。",
        });
      } else {
        await Swal.fire({
          icon: "error",
          title: "支付状态确认失败",
          text: "暂时无法确认支付结果，正在返回原页面。",
        });
      }
      if (!cancelled) {
        navigate(returnPath, { replace: true });
      }
    }

    handleReturn();

    return () => {
      cancelled = true;
    };
  }, [navigate, reloadMe, searchParams]);

  return null;
}
