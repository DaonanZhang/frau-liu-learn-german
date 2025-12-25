import Card from "./Card";
import "./dashboardCards.css";

export default function CalendarCard({
  title = "December 2025",
  // 1..31 里哪些天高亮（学习日）
  activeDays = [8, 10, 12, 20, 21],
  // 当前选中日（蓝色圈）
  selectedDay = 25,
  onPrev,
  onNext,
}) {
  const actions = (
    <div className="cal-actions">
      <button className="cal-nav-btn" type="button" onClick={onPrev}>
        ‹
      </button>
      <button className="cal-nav-btn" type="button" onClick={onNext}>
        ›
      </button>
    </div>
  );

  return (
    <Card title={title} icon="🗓️" actions={actions}>
      <div className="calendar">
        <div className="cal-weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="cal-weekday">
              {d}
            </div>
          ))}
        </div>

        <div className="cal-grid">
          {/* 静态占位：简单渲染 1..31 */}
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
            const isActive = activeDays.includes(day);
            const isSelected = selectedDay === day;

            return (
              <button
                key={day}
                type="button"
                className={[
                  "cal-day",
                  isActive ? "is-active" : "",
                  isSelected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                // 未来你要点选日期时，在这里接 onClick(day)
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
