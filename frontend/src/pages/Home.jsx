import { useEffect, useState } from "react";

import StatsCard from "../components/common/StatsCard";
import CalendarCard from "../components/common/CalendarCard";
import LearningMessagesCard from "../components/common/LearningMessagesCard";

import VideoFilter from "../components/video/VideoFilter";
import VideoGrid from "../components/video/VideoGrid";

import { fetchVideoList } from "../api/learning_by_video/videos.js";
import { markUserDailyActive } from "../api/user_data/userData";

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videosErrorText, setVideosErrorText] = useState("");

  useEffect(() => {
    markUserDailyActive().catch(() => {
      // silently fail, this should never block homepage rendering
    });
  }, []);

  useEffect(() => {
    let aborted = false;

    async function loadVideos() {
      try {
        setLoadingVideos(true);
        setVideosErrorText("");

        const { results } = await fetchVideoList({
          ordering: "-created_at",
        });

        if (aborted) return;
        setVideos(results);
      } catch (err) {
        if (aborted) return;
        setVideosErrorText(err?.message ? String(err.message) : "Unknown error");
      } finally {
        if (!aborted) setLoadingVideos(false);
      }
    }

    loadVideos();

    return () => {
      aborted = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
      <div
        style={{
          width: "22rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <StatsCard
          stats={[
            { label: "总视频数", value: String(videos.length) },
            { label: "完成视频", value: "3", tone: "green" },
            { label: "学习天数", value: "10", tone: "blue" },
          ]}
        />
        <CalendarCard activeDays={[7, 10, 12, 20, 21]} />
        <LearningMessagesCard />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <VideoFilter />
        <VideoGrid videos={videos} loading={loadingVideos} errorText={videosErrorText} />
      </div>
    </div>
  );
}
