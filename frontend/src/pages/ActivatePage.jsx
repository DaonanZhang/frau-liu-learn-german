import React, { useMemo, useState } from "react";
import AuthLayout from "../components/AuthLayout.jsx";
import Stepper from "../components/Stepper.jsx";

export default function ActivatePage() {
  const [code, setCode] = useState("");

  const canVerify = useMemo(() => code.trim().length > 0, [code]);

  const onVerify = (e) => {
    e.preventDefault();
    if (!canVerify) return;

    // TODO: call your API here
    // Example: await api.post("/auth/activate/verify", { code })
    console.log("verify activation code:", code);
  };

  return (
    <AuthLayout className="auth-activate">
      <div className="auth-logo" aria-hidden="true">
        <div className="logo-pill">
          <div className="logo-triangle" />
        </div>
      </div>

      <h1 className="auth-title">账号激活</h1>
      <p className="auth-subtitle">专为油管英语口语设计的学习网站</p>

      <Stepper current={1} />

      <form className="auth-form" onSubmit={onVerify}>
        <input
          className="auth-input big"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="请输入激活码"
          autoComplete="one-time-code"
        />

        <button className="auth-btn" type="submit" disabled={!canVerify}>
          验证激活码
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
    </AuthLayout>
  );
}
