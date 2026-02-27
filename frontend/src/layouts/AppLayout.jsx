import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Navigator from "../components/Navigator";
import SiteFooter from "../components/SiteFooter";
import { useAuth } from "../api/auth";
import "./AppLayout.css";

export default function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isManualPage = location.pathname.startsWith("/manual");

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      navigate("/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [loading, isAuthenticated, navigate, location.pathname]);

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="app-layout">
      <Navigator />

      <div className={["app-body", isManualPage ? "app-body--manual" : ""].filter(Boolean).join(" ")}>
        <div className="app-container">
          {/*TODO: Sidebar for later*/}
          {/*<aside className="app-sidebar">*/}
          {/*  <div className="sidebar-title">Frau Liu</div>*/}

          {/*  <nav className="sidebar-nav">*/}
          {/*    <Link to="/">Home</Link>*/}
          {/*    <Link to="/videos/1">Video #1</Link>*/}
          {/*  </nav>*/}
          {/*</aside>*/}

          <main className="app-main">
            <Outlet />
          </main>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
