import { useEffect, useState } from "react";

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
  title = "通知",
  items = DEFAULT_ITEMS,
}) {
  const [listItems, setListItems] = useState(items);
  const [currentIndex, setCurrentIndex] = useState(0);

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
          type: "公告",
          title: item?.title ? String(item.title) : "",
          description: item?.content ? String(item.content) : "",
          dateText: formatDate(item?.created_at),
        }));

        setListItems(mapped);
        setCurrentIndex(0);
      })
      .catch(() => {
        // keep fallback items
      });

    return () => {
      aborted = true;
    };
  }, []);

  const itemCount = Array.isArray(listItems) ? listItems.length : 0;
  const currentItem = itemCount > 0 ? listItems[currentIndex] : null;

  const actions = itemCount > 1 ? (
    <div className="msg-nav" aria-label="通知切换">
      <button
        className="msg-nav-btn"
        type="button"
        onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
        disabled={currentIndex === 0}
        aria-label="查看较新的通知"
      >
        ‹
      </button>
      <span className="msg-nav-count" aria-live="polite">
        {currentIndex + 1}/{itemCount}
      </span>
      <button
        className="msg-nav-btn"
        type="button"
        onClick={() =>
          setCurrentIndex((index) => Math.min(itemCount - 1, index + 1))
        }
        disabled={currentIndex === itemCount - 1}
        aria-label="查看较早的通知"
      >
        ›
      </button>
    </div>
  ) : null;

  return (
    <Card title={title} icon="💬" actions={actions}>
      <div className="msg-list">
        {currentItem ? (
          <article key={`${currentItem.title}-${currentIndex}`} className="msg-item">
            <div className="msg-type">{currentItem.type}</div>
            <div className="msg-title">{currentItem.title}</div>
            <div className="msg-desc">{currentItem.description}</div>
            {currentItem.dateText ? (
              <div className="msg-date">{currentItem.dateText}</div>
            ) : null}
          </article>
        ) : null}
      </div>
    </Card>
  );
}
