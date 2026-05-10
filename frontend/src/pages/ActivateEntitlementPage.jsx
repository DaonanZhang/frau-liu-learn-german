import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import AuthLayout from "../components/AuthLayout.jsx";
import { applyActivationCode, verifyActivationCode } from "../api/auth/auth";
import { useAuth } from "../api/auth/useAuth.js";

export default function ActivateEntitlementPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { reloadMe } = useAuth();

  const canVerify = useMemo(
    () => code.trim().length > 0 && !loading,
    [code, loading]
  );

  const onVerify = async (e) => {
    e.preventDefault();
    if (!canVerify) return;

    setLoading(true);
    try {
      const data = await verifyActivationCode(code.trim());
      if (!data || (Array.isArray(data?.entitlements) && data.entitlements.length === 0)) {
        await Swal.fire({
          icon: "error",
          title: "兑换码无效",
          text: "兑换码无效或已过期",
        });
        return;
      }
      const result = await applyActivationCode(code.trim());
      if (result.ok) {
        await reloadMe();
        navigate("/", { replace: true });
      }
    } catch (err) {
      console.error("[verify] failed:", err);
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
    <AuthLayout className="auth-activate">
      <div className="auth-logo" aria-hidden="true">
        <div className="logo-pill">
          <div className="logo-triangle" />
        </div>
      </div>

      <h1 className="auth-title">兑换码</h1>
      <p className="auth-subtitle">输入兑换码，激活权限</p>

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
