import { Link, Outlet } from "react-router-dom";
import Navigator from "../components/Navigator";
import "./AppLayout.css";

export default function AppLayout() {
  return (
    <div className="app-layout">
      <Navigator />

        <div className="app-body">
          <div className="app-container">
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
    </div>
  );
}
