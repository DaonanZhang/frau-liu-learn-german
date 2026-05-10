import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout.jsx";
import { registerUser } from "../api/auth/auth";

const COUNTRY_CODE_OPTIONS = [
  { value: "+86", label: "🇨🇳 中国 +86" },
  { value: "+49", label: "🇩🇪 德国 +49" },
  { value: "+43", label: "🇦🇹 奥地利 +43" },
  { value: "+41", label: "🇨🇭 瑞士 +41" },
  { value: "+852", label: "🇭🇰 中国香港 +852" },
  { value: "+853", label: "🇲🇴 中国澳门 +853" },
  { value: "+886", label: "中国台湾 +886" },
  { value: "+65", label: "🇸🇬 新加坡 +65" },
  { value: "+81", label: "🇯🇵 日本 +81" },
  { value: "+82", label: "🇰🇷 韩国 +82" },
  { value: "+44", label: "🇬🇧 英国 +44" },
  { value: "+33", label: "🇫🇷 法国 +33" },
  { value: "+1", label: "🇺🇸 美国 +1" },
  { value: "+61", label: "🇦🇺 澳大利亚 +61" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ActivatePage() {
  const navigate = useNavigate();
  const [countryCode, setCountryCode] = useState(COUNTRY_CODE_OPTIONS[0]?.value || "+86");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canRegister = useMemo(
    () =>
      phone.trim().length === 11 &&
      EMAIL_PATTERN.test(normalizedEmail) &&
      password.trim().length >= 6 &&
      !loading,
    [phone, normalizedEmail, password, loading]
  );

  const onRegister = async (e) => {
    e.preventDefault();
    if (!canRegister) return;

    setLoading(true);
    const result = await registerUser({
      telephone: phone.trim(),
      countryCode,
      email: normalizedEmail,
      password,
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
          navigate("/login", { replace: true });
        }}
      >
        ←
      </button>

      <div className="auth-logo">
        <img src="/images/icon.jpeg" alt="logo" className="auth-logo-img" />
      </div>

      <h1 className="auth-title">注册账号</h1>
      <p className="auth-subtitle">使用手机号、邮箱和密码直接创建账户</p>

      <form className="auth-form" onSubmit={onRegister}>
        <label className="auth-label">
          手机号
          <div className="auth-input-row">
            <select
              className="auth-input auth-select"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              autoComplete="tel-country-code"
            >
              {COUNTRY_CODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="auth-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="请输入11位手机号"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              pattern="[0-9]{11}"
            />
          </div>
        </label>

        <label className="auth-label">
          邮箱
          <input
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            type="email"
            autoComplete="email"
          />
        </label>

        <label className="auth-label">
          密码
          <div className="auth-passwordField">
            <input
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入至少6位密码"
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

        <button className="auth-btn gradient" type="submit" disabled={!canRegister}>
          {loading ? "注册中..." : "立即注册"}
        </button>
      </form>
    </AuthLayout>
  );
}
