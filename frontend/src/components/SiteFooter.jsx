import "./SiteFooter.css";

export default function SiteFooter({ className = "" }) {
  return (
    <footer className={["site-footer", className].filter(Boolean).join(" ")}>
      <div className="site-footer__inner">
        <a href="https://beian.miit.gov.cn" rel="noreferrer" target="_blank">
          皖ICP备2026004358号
        </a>
        <span className="site-footer__divider" aria-hidden="true">
          |
        </span>
        <a
          href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=34182202342323"
          rel="noreferrer"
          target="_blank"
        >
          皖公网安备34182202342323号
        </a>
      </div>
    </footer>
  );
}
