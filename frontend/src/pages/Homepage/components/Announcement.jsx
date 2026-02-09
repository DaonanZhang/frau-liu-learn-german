import { useEffect, useMemo, useState } from "react";

import { fetchAnnouncementList } from "../../../api/announcement.js";
import Card from "./Card.jsx";
import "./dashboardCards.css";

const todayText = new Date().toISOString().slice(0, 10).replaceAll("-", "/");


const DEFAULT_ITEMS = [
  {
    type: "活动通知",
    title: "暂无通知",
    description: "",
    dateText: todayText,
  },
];

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export default function Announcement({
  title = "学习消息",
  items = DEFAULT_ITEMS,
  limit = 3,
  onCollapseToggle,
}) {
  const [listItems, setListItems] = useState(items);

  useEffect(() => {
    let aborted = false;

    fetchAnnouncementList({ ordering: "-created_at" })
      .then((data) => {
        if (aborted) return;
        const results = Array.isArray(data?.results) ? data.results : [];
        if (results.length === 0) {
          return;
        }

        const mapped = results.map((item) => ({
          type: item?.priority !== null && item?.priority !== undefined
            ? `优先级 ${item.priority}`
            : "公告",
          title: item?.title ? String(item.title) : "",
          description: item?.content ? String(item.content) : "",
          dateText: formatDate(item?.created_at),
        }));

        setListItems(mapped);
      })
      .catch(() => {
        // keep fallback items
      });

    return () => {
      aborted = true;
    };
  }, []);

  const displayItems = useMemo(() => {
    if (!Array.isArray(listItems)) return [];
    if (!Number.isFinite(Number(limit))) return listItems;
    return listItems.slice(0, Math.max(0, Number(limit)));
  }, [listItems, limit]);

  const actions = (
    <button className="msg-collapse-btn" type="button" onClick={onCollapseToggle}>
      ▲
    </button>
  );

  return (
    <Card title={title} icon="💬" actions={actions}>
      <div className="msg-list">
        {displayItems.map((it, idx) => (
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
