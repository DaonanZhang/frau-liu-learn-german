import Card from "./Card";
import "./dashboardCards.css";

export default function StatsCard({
  title = "学习统计",
  stats = [
    { label: "总视频数", value: "118" },
    { label: "完成视频", value: "3", tone: "green" },
    { label: "学习天数", value: "7", tone: "blue" },
  ],
}) {
  return (
    <Card title={title} icon="📊">
      <div className="stats-grid">
        {stats.map((item) => (
          <div key={item.label} className="stats-item">
            <div className={`stats-value ${item.tone ? `tone-${item.tone}` : ""}`}>
              {item.value}
            </div>
            <div className="stats-label">{item.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
