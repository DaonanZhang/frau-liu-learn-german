import { useEffect, useRef } from "react";
import "./DeviceSessionExpiredModal.css";

export default function DeviceSessionExpiredModal({ open, onReload, onLogout }) {
  const reloadButtonRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    reloadButtonRef.current?.focus();

    function keepFocusInDialog(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = document.querySelector(".device-session-expired__dialog");
      const buttons = dialog?.querySelectorAll("button") || [];
      if (buttons.length === 0) {
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepFocusInDialog);
    return () => {
      document.removeEventListener("keydown", keepFocusInDialog);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="device-session-expired__overlay" role="presentation">
      <section
        className="device-session-expired__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-session-expired-title"
        aria-describedby="device-session-expired-message"
      >
        <h2 id="device-session-expired-title">登录会话已过期</h2>
        <p id="device-session-expired-message">您的登录会话已过期，请退出后重新登录</p>
        <div className="device-session-expired__actions">
          <button
            ref={reloadButtonRef}
            className="device-session-expired__primary"
            type="button"
            onClick={onReload}
          >
            重新登录
          </button>
          <button
            className="device-session-expired__secondary"
            type="button"
            onClick={onLogout}
          >
            退出登录
          </button>
        </div>
      </section>
    </div>
  );
}
