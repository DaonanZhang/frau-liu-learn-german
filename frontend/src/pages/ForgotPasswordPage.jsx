import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import Stepper from "../components/Stepper.jsx";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../api/auth/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_PATTERN.test(normalizedEmail);

  const canRequest = useMemo(
    () => emailValid && !loading,
    [emailValid, loading]
  );
  const canConfirm = useMemo(
    () =>
      emailValid &&
      /^\d{6}$/.test(code.trim()) &&
      newPassword.trim().length >= 6 &&
      confirmPassword === newPassword &&
      !loading,
    [emailValid, code, newPassword, confirmPassword, loading]
  );

  const handleRequestCode = async (event) => {
    event.preventDefault();
    if (!canRequest) return;

    setLoading(true);
    const result = await requestPasswordReset(normalizedEmail);
    setLoading(false);

    if (result.ok) {
      setStep(2);
    }
  };

  const handleConfirmReset = async (event) => {
    event.preventDefault();
    if (!canConfirm) return;

    setLoading(true);
    const result = await confirmPasswordReset({
      email: normalizedEmail,
      code: code.trim(),
      newPassword,
    });
    setLoading(false);

    if (result.ok) {
      navigate("/login", { replace: true });
    }
  };

  return (
    <AuthLayout className="auth-activate">
      <button
        className="back-btn"
        type="button"
        aria-label="返回"
        onClick={() => {
          if (step === 2) {
            setStep(1);
            return;
          }
          navigate("/login", { replace: true });
        }}
      >
        ←
      </button>

      <div className="auth-logo">
        <img
          src="/images/icon.jpeg"
          alt="logo"
          className="auth-logo-img"
        />
      </div>

      <h1 className="auth-title">忘记密码</h1>
      <p className="auth-subtitle">通过邮箱验证码重新设置登录密码</p>

      <Stepper
        current={step}
        labels={["输入验证码", "重置密码"]}
      />

      {step === 1 ? (
        <form className="auth-form" onSubmit={handleRequestCode}>
          <label className="auth-label">
            邮箱
            <input
              className="auth-input big"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="请输入绑定邮箱"
              autoComplete="email"
            />
          </label>

          <button className="auth-btn gradient" type="submit" disabled={!canRequest}>
            {loading ? "发送中..." : "发送验证码"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={handleConfirmReset}>
          <label className="auth-label">
            邮箱
            <input className="auth-input auth-input--readonly" value={normalizedEmail} readOnly />
          </label>

          <label className="auth-label">
            验证码
            <input
              className="auth-input"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="请输入 6 位验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
            />
          </label>

          <label className="auth-label">
            新密码
            <div className="auth-passwordField">
              <input
                className="auth-input"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="请输入不少于 6 位的新密码"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
              />
              <button
                className="auth-passwordToggle"
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? (
                  <svg className="auth-passwordIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.5 0 9.7 4.7 10.9 7-0.5 1-1.7 2.8-3.6 4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M6.2 6.2C3.9 7.8 2.4 10.1 1.1 12c1.2 2.2 5.4 7 10.9 7 1.6 0 3.1-.4 4.4-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="auth-passwordIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M1.1 12c1.2-2.2 5.4-7 10.9-7s9.7 4.7 10.9 7c-1.2 2.2-5.4 7-10.9 7S2.3 14.2 1.1 12Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <label className="auth-label">
            重复新密码
            <div className="auth-passwordField">
              <input
                className="auth-input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="请再次输入新密码"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
              />
              <button
                className="auth-passwordToggle"
                type="button"
                aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
              >
                {showConfirmPassword ? (
                  <svg className="auth-passwordIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.5 0 9.7 4.7 10.9 7-0.5 1-1.7 2.8-3.6 4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M6.2 6.2C3.9 7.8 2.4 10.1 1.1 12c1.2 2.2 5.4 7 10.9 7 1.6 0 3.1-.4 4.4-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="auth-passwordIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M1.1 12c1.2-2.2 5.4-7 10.9-7s9.7 4.7 10.9 7c-1.2 2.2-5.4 7-10.9 7S2.3 14.2 1.1 12Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <div className="auth-inlineActions">
            <span className="auth-hint">验证码有效期 15 分钟</span>
            <button
              className="auth-linkButton"
              type="button"
              onClick={handleRequestCode}
              disabled={!canRequest || loading}
            >
              重新发送验证码
            </button>
          </div>

          <button className="auth-btn gradient" type="submit" disabled={!canConfirm}>
            {loading ? "提交中..." : "确认重置密码"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
