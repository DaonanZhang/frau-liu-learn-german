import "./Navigator.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../api/auth";

export default function Navigator() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return null;
  }

  const displayName = user?.username || user?.telephone || "用户";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="navigator">
      <div className="nav-container">
        <div className="nav-left">
          <img src="/images/icon.jpeg" alt="logo" className="nav-logo" />
          <span className="nav-title">跟着符号刘学德语</span>
        </div>

        <nav className="nav-right">
          <button className="nav-btn primary">学习记录</button>
          <button className="nav-btn">英语卡片</button>

          <div className="nav-user">
            <span className="nav-username">欢迎，{displayName}</span>
            <button className="nav-btn ghost" onClick={handleLogout}>
              登出
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
