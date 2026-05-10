import Card from "./Card.jsx";
import "./dashboardCards.css";
import "./StatsCard.css"

export default function StatsCard({
  title = "学习统计",
  compact = false,
  stats = [
    { label: "总视频数", value: 0 },
    { label: "完成视频", value: 0, tone: "green" },
    { label: "学习天数", value: 0, tone: "blue" },
  ],
}) {
  return (
    <Card
      title={title}
      className={compact ? "stats-card stats-card--compact" : "stats-card"}
      icon={<i className="fa-solid fa-chart-column stats-card-icon" />}
    >
      <div className={compact ? "stats-grid stats-grid--compact" : "stats-grid"}>
        {stats.map((item) => {
          const value =
            item.value === undefined || item.value === null
              ? 0
              : item.value;

          return (
            <div
              key={item.label}
              className={compact ? "stats-item stats-item--compact" : "stats-item"}
            >
              <div
                className={`stats-value ${
                  item.tone ? `tone-${item.tone}` : ""
                } ${compact ? "stats-value--compact" : ""}`}
              >
                {value}
              </div>
              <div className={compact ? "stats-label stats-label--compact" : "stats-label"}>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
