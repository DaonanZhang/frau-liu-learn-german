import StatsCard from "./components/StatsCard.jsx";
import CalendarCard from "./components/CalendarCard";
import Announcement from "./components/Announcement";
import WeChatQrCard from "./components/WeChatQrCard";

export default function HomeSidebarContent({
  stats,
  activeDates = [],
  activeDaysCount = null,
  isMobileView = false,
  onCloseMobile,
  showStats = true,
  statsCompact = false,
  showCalendar = true,
  showAnnouncement = true,
  showWeChatQr = true,
  extraContent = null,
}) {
  return (
    <div className="home-left-content">
      {isMobileView ? (
        <div className="home-drawer-header">
          <div className="home-drawer-title">学习面板</div>
          <button
            className="home-drawer-close"
            type="button"
            onClick={() => {
              onCloseMobile?.();
            }}
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
      ) : null}

      {showStats ? <StatsCard stats={stats} compact={statsCompact} /> : null}
      {showCalendar ? (
        <CalendarCard
          activeDates={activeDates}
          activeDaysCount={activeDaysCount}
          maxPastMonths={3}
        />
      ) : null}
      {showAnnouncement ? <Announcement /> : null}
      {showWeChatQr ? <WeChatQrCard /> : null}
      {extraContent}
    </div>
  );
}
