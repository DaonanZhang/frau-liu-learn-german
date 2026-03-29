import { useEffect, useState } from "react";
import "./ManualPage.css";
import ManualWebContent from "./manual/ManualWebContent";
import ManualMobileContent from "./manual/ManualMobileContent";

const MOBILE_BREAKPOINT = 990;

function getManualModeFromViewport() {
  if (typeof window === "undefined") {
    return "web";
  }
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
    ? "mobile"
    : "web";
}

export default function ManualPage() {
  const [manualMode, setManualMode] = useState(getManualModeFromViewport);
  const [isManuallySwitched, setIsManuallySwitched] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleViewportChange = () => {
      if (!isManuallySwitched) {
        setManualMode(query.matches ? "mobile" : "web");
      }
    };

    handleViewportChange();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handleViewportChange);
      return () => {
        query.removeEventListener("change", handleViewportChange);
      };
    }

    query.addListener(handleViewportChange);
    return () => {
      query.removeListener(handleViewportChange);
    };
  }, [isManuallySwitched]);

  const switchTo = (mode) => {
    setManualMode(mode);
    setIsManuallySwitched(true);
  };

  return (
    <div className="manual-page">
      <div className="manual-shell">
        <div className="manual-switcher" role="tablist" aria-label="manual version selector">
          <button
            type="button"
            role="tab"
            aria-selected={manualMode === "web"}
            className={[
              "manual-switcher__btn",
              manualMode === "web" ? "manual-switcher__btn--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              switchTo("web");
            }}
          >
            网页版
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={manualMode === "mobile"}
            className={[
              "manual-switcher__btn",
              manualMode === "mobile" ? "manual-switcher__btn--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              switchTo("mobile");
            }}
          >
            手机版
          </button>
        </div>

        <div className="manual-content">
          {manualMode === "mobile" ? <ManualMobileContent /> : <ManualWebContent />}
        </div>
      </div>
    </div>
  );
}
