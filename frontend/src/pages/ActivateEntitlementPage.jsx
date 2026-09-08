import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import AuthLayout from "../components/AuthLayout.jsx";
import { redeemCode } from "../api/auth/auth";
import { useAuth } from "../api/auth/useAuth.js";

export default function ActivateEntitlementPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { reloadMe, logout } = useAuth();

  const canVerify = useMemo(
    () => code.trim().length > 0 && !loading,
    [code, loading]
  );

  const onVerify = async (e) => {
    e.preventDefault();
    if (!canVerify) return;

    setLoading(true);
    try {
      const result = await redeemCode(code.trim());
      if (result?.type === "promotion") {
        await Swal.fire({
          icon: "success",
          title: "优惠领取成功",
          text: `已获得 ¥${result.coupon.discount_amount} 优惠。可在个人资料的“我的优惠券”中查看。`,
        });
        navigate(result?.coupon?.profile_path || "/profile#coupons", { replace: true });
        return;
      } else {
        await Swal.fire({
          icon: "success",
          title: "激活成功",
          text: "权限已添加到当前账户",
        });
        await reloadMe();
      }
      navigate("/", { replace: true });
    } catch (err) {
      console.error("[verify] failed:", err);
      if (err?.status === 401) {
        logout();
        await Swal.fire({
          icon: "warning",
          title: "登录已失效",
          text: "请重新登录后再兑换，兑换码尚未被使用。",
        });
        navigate("/login", {
          replace: true,
          state: { returnTo: "/redeem-code" },
        });
        return;
      }
      if (err?.status >= 500) {
        await Swal.fire({
          icon: "error",
          title: "兑换暂时失败",
          text: "服务器处理兑换码时出现问题，请稍后重试。兑换码尚未被使用。",
        });
        return;
      }
      await Swal.fire({
        icon: "error",
        title: "兑换码无效",
        text: err?.data?.detail || "兑换码无效或已过期",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout className="auth-activate" showFooter={false}>
      <div className="auth-logo" aria-hidden="true">
        <div className="logo-pill">
          <div className="logo-triangle" />
        </div>
      </div>

      <h1 className="auth-title">兑换码</h1>
      <p className="auth-subtitle">输入激活码或推广码，兑换权限或优惠</p>

      <form className="auth-form" onSubmit={onVerify}>
        <input
          className="auth-input big"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="请输入兑换码"
          autoComplete="one-time-code"
        />

        <button className="auth-btn gradient" type="submit" disabled={!canVerify}>
          {loading ? "处理中..." : "立即兑换"}
        </button>

        <div className="auth-divider" />

        <button
          className="auth-btn ghost"
          type="button"
          onClick={() => navigate("/", { replace: true })}
        >
          返回首页
        </button>
      </form>
    </AuthLayout>
  );
}
