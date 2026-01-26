import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { login, useAuth } from "../api/auth";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

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
      navigate("/", { replace: true });
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
          <input
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            type="password"
            autoComplete="current-password"
          />
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
