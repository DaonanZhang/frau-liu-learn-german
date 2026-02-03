import Card from "./Card.jsx";
import "./dashboardCards.css";

export default function LearningMessagesCard({
  title = "学习消息",
  items = [
    {
      type: "活动通知",
      title: "1月预计组织免费刷题活动",
      description: "学习交流群&刷题群，添加微信号：Joe7161，备注“油管”。",
      dateText: "2025/12/24",
    },
  ],
  onCollapseToggle,
}) {
  const actions = (
    <button className="msg-collapse-btn" type="button" onClick={onCollapseToggle}>
      ▲
    </button>
  );

  return (
    <Card title={title} icon="💬" actions={actions}>
      <div className="msg-list">
        {items.map((it, idx) => (
          <article key={`${it.title}-${idx}`} className="msg-item">
            <div className="msg-type">{it.type}</div>
            <div className="msg-title">{it.title}</div>
            <div className="msg-desc">{it.description}</div>
            {it.dateText ? <div className="msg-date">{it.dateText}</div> : null}
          </article>
        ))}
      </div>
    </Card>
  );
}
