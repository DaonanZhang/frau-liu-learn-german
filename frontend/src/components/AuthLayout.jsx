import React from "react";
import SiteFooter from "./SiteFooter";

export default function AuthLayout({ children, showFooter = true }) {
  return (
    <div className="auth-bg">
      <div className="auth-center">
        <div className="auth-card">{children}</div>
      </div>
      {showFooter ? <SiteFooter className="site-footer--auth" /> : null}
    </div>
  );
}
