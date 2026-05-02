import { useEffect, useState } from "react";
import "./SiteFooter.css";

export default function SiteFooter({ className = "" }) {
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);

  useEffect(() => {
    if (!isNoticeOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsNoticeOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNoticeOpen]);

  return (
    <footer className={["site-footer", className].filter(Boolean).join(" ")}>
      <div className="site-footer__inner">
        <button
          type="button"
          className="site-footer__linkBtn"
          onClick={() => {
            setIsNoticeOpen(true);
          }}
        >
          版权说明
        </button>
        <span className="site-footer__divider" aria-hidden="true">
          |
        </span>
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

      {isNoticeOpen ? (
        <div
          className="site-footer__modalOverlay"
          onClick={() => {
            setIsNoticeOpen(false);
          }}
        >
          <div
            className="site-footer__modal"
            role="dialog"
            aria-modal="true"
            aria-label="版权说明"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="site-footer__modalHeader">
              <div className="site-footer__modalTitle">版权说明 / Urheberrechtlicher Hinweis</div>
              <button
                type="button"
                className="site-footer__modalClose"
                aria-label="Close copyright notice"
                onClick={() => {
                  setIsNoticeOpen(false);
                }}
              >
                ×
              </button>
            </div>

            <div className="site-footer__modalBody">
              <p>
                本课程所引用之视频素材均来源于 YouTube 等网络平台。本平台仅对视频语料进行深度的教学加工
                （如语法讲解、听力练习等），旨在促进德语教学与研究。视频素材的原始版权始终归原作者所有。
              </p>
              <p>
                本站尊重原创，所有引用素材均已标注来源。如您是原作者且不希望您的素材被用于此类教学研究，
                请联系我们，我们将立即撤除。
              </p>
              <p>
                Die in diesem Kurs verwendeten Videomaterialien stammen von Online-Plattformen wie{" "}
                <strong>YouTube</strong>. Diese werden ausschließlich für{" "}
                <strong>Bildungs- und Forschungszwecke</strong> (z. B. Grammatikerklärungen,
                Hörverständnisübungen) tiefgehend aufbereitet.
              </p>
              <p>
                Das Urheberrecht der Originalvideos verbleibt vollumfänglich bei den jeweiligen
                Urhebern.
              </p>
              <p>
                如有任何版权争议或需撤回授权，请联系：
                <a href="mailto:contact@frauliu.com">contact@frauliu.com</a>
                。我们将于 24 小时内处理。
              </p>
              <p>
                Bei Urheberrechtsfragen oder für den Widerruf der Nutzung wenden Sie sich bitte an:{" "}
                <a href="mailto:contact@frauliu.com">contact@frauliu.com</a>. Wir werden Ihr
                Anliegen innerhalb von 24 Stunden bearbeiten.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </footer>
  );
}
