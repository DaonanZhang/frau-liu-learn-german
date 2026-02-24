import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { login, useAuth } from "../api/auth";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();
  const { notifyLogin, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  const canSubmit = phone.trim().length > 0 && password.trim().length > 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const result = await login(phone, password);
    if (result.ok) {
      notifyLogin();
    }
  };

  if (loading) {
    return null;
  }

  return (
    <AuthLayout className="auth-activate">
    <div className="auth-logo">
      <img
        src="/images/icon.jpeg"
        alt="logo"
        className="auth-logo-img"
      />
    </div>

      <h1 className="auth-title">符号刘的德语学习平台</h1>
      <p className="auth-subtitle">Dein Weg zum Deutsch</p>

      <form className="auth-form" onSubmit={onSubmit}>
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
          <div className="auth-passwordField">
            <input
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
            />
            <button
              className="auth-passwordToggle"
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? (
                <svg className="auth-passwordIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l18 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10.6 10.6A3 3 0 0 0 13.4 13.4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M9.9 5.2A10.5 10.5 0 0 1 12 5c5.5 0 9.7 4.7 10.9 7-0.5 1-1.7 2.8-3.6 4.3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.2 6.2C3.9 7.8 2.4 10.1 1.1 12c1.2 2.2 5.4 7 10.9 7 1.6 0 3.1-.4 4.4-1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg className="auth-passwordIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M1.1 12c1.2-2.2 5.4-7 10.9-7s9.7 4.7 10.9 7c-1.2 2.2-5.4 7-10.9 7S2.3 14.2 1.1 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              )}
            </button>
          </div>
        </label>

        <button className="auth-btn gradient" type="submit" disabled={!canSubmit}>
          登录
        </button>

        <div className="auth-divider" />

        <div className="auth-footer">
          <span>还没有账号？</span>
          <Link className="auth-link" to="/activate">
            立即注册
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
