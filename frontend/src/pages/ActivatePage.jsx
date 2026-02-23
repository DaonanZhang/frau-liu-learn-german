import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import AuthLayout from "../components/AuthLayout.jsx";
import Stepper from "../components/Stepper.jsx";
import {
  registerWithActivationCode,
  verifyActivationCode,
} from "../api/auth/auth";

export default function ActivatePage() {
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const canVerify = useMemo(
    () => code.trim().length > 0 && !loading,
    [code, loading]
  );
  const canRegister = useMemo(
    () =>
      code.trim().length > 0 &&
      phone.trim().length > 0 &&
      password.trim().length > 0 &&
      !loading,
    [code, phone, password, loading]
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
      setPreview(data || null);
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

  const onRegister = async (e) => {
    e.preventDefault();
    if (!canRegister) return;

    setLoading(true);
    const result = await registerWithActivationCode({
      code: code.trim(),
      telephone: phone.trim(),
      password,
    });
    setLoading(false);

    if (result.ok) {
      navigate("/login", { replace: true });
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

      <h1 className="auth-title">账号激活</h1>
      <p className="auth-subtitle">专为德语学习设计的网站</p>

      <Stepper current={step} />

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

          <div className="auth-hint">
            没有激活码，请联系小红书：
            <a
              className="auth-link"
              href="https://www.xiaohongshu.com/user/profile/5b1f9ea611be101e03289ee0?xsec_token=ABm8RZG6QiwqBt39EBU6LgHLR9Zbxjw9mfrdOskegK2MY%3D&xsec_source=pc_search"
              target="_blank"
              rel="noopener noreferrer"
            >
              符号刘
            </a>
          </div>
        </form>
      ) : (
        <form className="auth-form" onSubmit={onRegister}>
          <label className="auth-label">
            激活码
            <input className="auth-input" value={code} readOnly />
          </label>

          <label className="auth-label">
            手机号
            <input
              className="auth-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入11位手机号"
              inputMode="numeric"
              autoComplete="tel"
            />
          </label>

          <label className="auth-label">
            密码
            <input
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              type="password"
              autoComplete="new-password"
            />
          </label>

          {preview?.entitlements?.length ? (
            <div className="auth-hint">已验证，可创建账户</div>
          ) : null}

          <button
            className="auth-btn gradient"
            type="submit"
            disabled={!canRegister}
          >
            {loading ? "创建中..." : "创建账户"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
