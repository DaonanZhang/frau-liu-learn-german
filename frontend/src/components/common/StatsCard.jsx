import Card from "./Card";
import "./dashboardCards.css";
import "./StatsCard.css"

export default function StatsCard({
  title = "学习统计",
  stats = [
    { label: "总视频数", value: 0 },
    { label: "完成视频", value: 0, tone: "green" },
    { label: "学习天数", value: 0, tone: "blue" },
  ],
}) {
  return (
    <Card
      title={title}
      icon={<i className="fa-solid fa-chart-column stats-card-icon" />}
    >
      <div className="stats-grid">
        {stats.map((item) => {
          const value =
            item.value === undefined || item.value === null
              ? 0
              : item.value;

          return (
            <div key={item.label} className="stats-item">
              <div
                className={`stats-value ${
                  item.tone ? `tone-${item.tone}` : ""
                }`}
              >
                {value}
              </div>
              <div className="stats-label">{item.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
