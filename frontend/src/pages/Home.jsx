import { useEffect, useState } from "react";
import { listVideos } from "../api/videos";
import StatsCard from "../components/common/StatsCard";
import CalendarCard from "../components/common/CalendarCard";
import LearningMessagesCard from "../components/common/LearningMessagesCard";
import VideoFilter from "../components/video/VideoFilter";

export default function Home() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    listVideos({ page: 1 })
      .then(setData)
      .catch((e) => setErr(e?.message || String(e)));
  }, []);

  return (
    <div style={{ display: "flex", gap: "1rem" }}>
      <div style={{ width: "22rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <StatsCard />
        <CalendarCard />
        <LearningMessagesCard />
      </div>

      <div style={{ flex: 1 }}>
          <VideoFilter />
        右侧内容区（后面放视频卡片 grid）
      </div>
    </div>
  );
}