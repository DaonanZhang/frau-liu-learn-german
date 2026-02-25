import React from "react";
import SiteFooter from "./SiteFooter";

export default function AuthLayout({ children }) {
  return (
    <div className="auth-bg">
      <div className="auth-center">
        <div className="auth-card">{children}</div>
      </div>
      <SiteFooter className="site-footer--auth" />
    </div>
  );
}
