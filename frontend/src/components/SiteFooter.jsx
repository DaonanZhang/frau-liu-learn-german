import { useEffect, useState } from "react";
import { collectBrowserInfo, submitBugReport } from "../api/bugReports.js";
import { useAuth } from "../api/auth";
import { getCapturedClientErrors } from "../utils/clientErrorBuffer.js";
import "./SiteFooter.css";

export default function SiteFooter({ className = "" }) {
  const { isAuthenticated } = useAuth();
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [hasConsent, setHasConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const isCnDomain =
    typeof window !== "undefined" && window.location.hostname.toLowerCase().endsWith(".cn");

  useEffect(() => {
    if (!isNoticeOpen && !isBugReportOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsNoticeOpen(false);
        setIsBugReportOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBugReportOpen, isNoticeOpen]);

  function openBugReport() {
    setReportText("");
    setHasConsent(false);
    setSubmitError("");
    setIsSubmitted(false);
    setIsBugReportOpen(true);
  }

  async function handleBugReportSubmit(event) {
    event.preventDefault();
    if (!reportText.trim() || !hasConsent || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError("");
      await submitBugReport({
        report: reportText.trim(),
        page_url: window.location.href,
        browser_info: collectBrowserInfo(),
        console_errors: getCapturedClientErrors(),
        consent: true,
      });
      setIsSubmitted(true);
    } catch (error) {
      setSubmitError(error?.data?.detail || "提交失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <footer className={["site-footer", className].filter(Boolean).join(" ")}>
      <div className="site-footer__contact">
        联系我们（客服邮箱）：
        <a href="mailto:contact@frauliu.com">contact@frauliu.com</a>

        （客服微信):
        xqsr_co
      </div>
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
        {isAuthenticated ? (
          <>
            <span className="site-footer__divider" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              className="site-footer__reportBtn"
              onClick={openBugReport}
            >
              汇报错误
            </button>
          </>
        ) : null}
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
          href={
            isCnDomain
              ? " "
              : "https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=34182202342323"
          }
          rel="noreferrer"
          target="_blank"
        >
          {isCnDomain ? "皖公网安备34182202342348号" : "皖公网安备34182202342323号"}
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

      {isBugReportOpen ? (
        <div
          className="site-footer__modalOverlay"
          onClick={() => {
            setIsBugReportOpen(false);
          }}
        >
          <div
            className="site-footer__modal site-footer__bugModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="site-footer__modalHeader">
              <div id="bug-report-title" className="site-footer__modalTitle">汇报 Bug 或错误</div>
              <button
                type="button"
                className="site-footer__modalClose"
                aria-label="关闭问题反馈"
                onClick={() => {
                  setIsBugReportOpen(false);
                }}
              >
                ×
              </button>
            </div>

            {isSubmitted ? (
              <div className="site-footer__bugSuccess" role="status">
                <strong>反馈已提交，感谢你的帮助！</strong>
                <button type="button" onClick={() => setIsBugReportOpen(false)}>完成</button>
              </div>
            ) : (
              <form className="site-footer__bugForm" onSubmit={handleBugReportSubmit}>
                <label className="site-footer__bugField">
                  <span>请描述遇到的问题</span>
                  <textarea
                    value={reportText}
                    maxLength={5000}
                    rows={6}
                    placeholder="请尽量写明你进行了什么操作、看到了什么，以及原本期待的结果。"
                    onChange={(event) => setReportText(event.target.value)}
                    required
                  />
                  <small>{reportText.length} / 5000</small>
                </label>

                <div className="site-footer__privacyNotice">
                  提交后，我们会收集你的反馈内容、当前登录用户 ID、IP 地址、当前页面、浏览器与设备信息，
                  以及本次页面会话中网站临时捕获的 Console 错误（当前共 {getCapturedClientErrors().length} 条），仅用于定位和修复问题。
                </div>

                <label className="site-footer__consent">
                  <input
                    type="checkbox"
                    checked={hasConsent}
                    onChange={(event) => setHasConsent(event.target.checked)}
                  />
                  <span>我已阅读并同意提交上述诊断信息。</span>
                </label>

                {submitError ? <p className="site-footer__bugError" role="alert">{submitError}</p> : null}

                <div className="site-footer__bugActions">
                  <button
                    type="button"
                    className="site-footer__bugCancel"
                    onClick={() => setIsBugReportOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="site-footer__bugSubmit"
                    disabled={!reportText.trim() || !hasConsent || isSubmitting}
                  >
                    {isSubmitting ? "正在提交…" : "同意并提交"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </footer>
  );
}
