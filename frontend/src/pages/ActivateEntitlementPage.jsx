import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import AuthLayout from "../components/AuthLayout.jsx";
import { applyActivationCode, verifyActivationCode } from "../api/auth/auth";

export default function ActivateEntitlementPage() {
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const canVerify = useMemo(
    () => code.trim().length > 0 && !loading,
    [code, loading]
  );

  const canApply = useMemo(
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
          title: "激活码无效",
          text: "激活码无效或已过期",
        });
        return;
      }
      setStep(2);
    } catch (err) {
      console.error("[verify] failed:", err);
      await Swal.fire({
        icon: "error",
        title: "激活码无效",
        text: err?.data?.detail || "激活码无效或已过期",
      });
    } finally {
      setLoading(false);
    }
  };

  const onApply = async (e) => {
    e.preventDefault();
    if (!canApply) return;

    setLoading(true);
    const result = await applyActivationCode(code.trim());
    setLoading(false);

    if (result.ok) {
      navigate("/", { replace: true });
    }
  };

  return (
    <AuthLayout className="auth-activate">
      {step === 2 && (
        <button
          className="back-btn"
          type="button"
          aria-label="返回"
          onClick={() => setStep(1)}
        >
          ←
        </button>
      )}

      <div className="auth-logo" aria-hidden="true">
        <div className="logo-pill">
          <div className="logo-triangle" />
        </div>
      </div>

      <h1 className="auth-title">权益兑换</h1>
      <p className="auth-subtitle">请输入兑换码，完成权益开通</p>

      {step === 1 ? (
        <form className="auth-form" onSubmit={onVerify}>
          <input
            className="auth-input big"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入激活码"
            autoComplete="one-time-code"
          />

          <button className="auth-btn" type="submit" disabled={!canVerify}>
            {loading ? "验证中..." : "验证激活码"}
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
      ) : (
        <form className="auth-form" onSubmit={onApply}>
          <label className="auth-label">
            激活码
            <input className="auth-input" value={code} readOnly />
          </label>

          <button className="auth-btn gradient" type="submit" disabled={!canApply}>
            {loading ? "处理中..." : "立即兑换"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
