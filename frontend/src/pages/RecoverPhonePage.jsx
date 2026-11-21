import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { requestPhoneRecovery } from "../api/auth/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecoverPhonePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = useMemo(
    () => EMAIL_PATTERN.test(normalizedEmail) && !loading,
    [normalizedEmail, loading]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    const result = await requestPhoneRecovery(normalizedEmail);
    setLoading(false);
    if (result.ok) {
      setSentEmail(normalizedEmail);
    }
  };

  return (
    <AuthLayout className="auth-activate">
      <button
        className="back-btn auth-recoveryBack"
        type="button"
        aria-label="返回"
        onClick={() => navigate("/login", { replace: true })}
      >
        ←
      </button>

      <div className="auth-logo">
        <img src="/images/icon.jpeg" alt="logo" className="auth-logo-img" />
      </div>

      {sentEmail ? (
        <div className="auth-recoverySuccess">
          <div className="auth-recoverySuccessIcon" aria-hidden="true">✓</div>
          <h1 className="auth-title">邮件已发送</h1>
          <p className="auth-recoveryStatus" role="status" aria-live="polite">
            注册手机号已发送至 <strong>{sentEmail}</strong>。
          </p>
          <p className="auth-hint">请查看收件箱，并按邮件中的区号和手机号登录。</p>
          <div className="auth-recoveryActions">
            <Link className="auth-btn gradient auth-btn--link" to="/login">
              返回登录
            </Link>
            <button
              className="auth-btn ghost"
              type="button"
              onClick={() => {
                setEmail("");
                setSentEmail("");
              }}
            >
              更换邮箱
            </button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="auth-title">找回注册手机号</h1>
          <p className="auth-recoveryIntro">
            系统会把国家区号和注册手机号发送到你的绑定邮箱。
          </p>

          <form className="auth-form auth-recoveryForm" onSubmit={handleSubmit}>
            <label className="auth-label" htmlFor="recover-phone-email">绑定邮箱</label>
            <input
              id="recover-phone-email"
              className="auth-input big"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              aria-describedby="recover-phone-email-hint"
            />
            <p id="recover-phone-email-hint" className="auth-fieldHint">
              请输入注册账号时绑定的邮箱。
            </p>

            <button className="auth-btn gradient" type="submit" disabled={!canSubmit}>
              {loading ? "发送中..." : "发送注册手机号"}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
