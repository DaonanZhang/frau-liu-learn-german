import "./Navigator.css";

export default function Navigator() {
  return (
    <header className="navigator">
      <div className="nav-container">
        <div className="nav-left">
          <img
            src="/images/icon.jpeg"
            alt="logo"
            className="nav-logo"
          />
          <span className="nav-title">跟着符号刘学德语</span>
        </div>

        <nav className="nav-right">
          <button className="nav-btn primary">学习记录</button>
          <button className="nav-btn">英语卡片</button>

          <div className="nav-user">
            <span className="nav-username">
              欢迎，用户19565716096
            </span>
            <button className="nav-btn ghost">登出</button>
          </div>
        </nav>
      </div>
    </header>
  );
}
