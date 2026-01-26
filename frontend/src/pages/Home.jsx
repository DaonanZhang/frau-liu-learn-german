import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import StatsCard from "../components/common/StatsCard";
import CalendarCard from "../components/common/CalendarCard";
import LearningMessagesCard from "../components/common/LearningMessagesCard";

import VideoFilter from "../components/video/VideoFilter";
import VideoGrid from "../components/video/VideoGrid";

import { fetchVideoList } from "../api/learning_by_video/videos.js";
import { markDailyActiveAndGetUserData } from "../api/user_data/userData";
import { fetchLearningVideoUserData } from "../api/learning_by_video/userData";

import "./Home.css";

/**
 * Safely convert a value into a number.
 *
 * @param {unknown} value - Any input.
 * @returns {number} Parsed number or 0.
 */
function toSafeNumber(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return 0;
}

/**
 * Build dashboard stats for StatsCard.
 *
 * @param {number} totalVideoCount - Total number of videos.
 * @param {number} completedVideos - Total video completed
 * @param {number} activeDays - Active days count.
 * @returns {Array<{label: string, value: string, tone?: string}>} Stats items.
 */
function buildStats(totalVideoCount, completedVideos, activeDays) {
  return [
    { label: "总视频数", value: String(totalVideoCount) },
    { label: "完成视频", value: String(completedVideos), tone: "green" },
    { label: "学习天数", value: String(activeDays), tone: "blue" },
  ];
}

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videosErrorText, setVideosErrorText] = useState("");

  const [userData, setUserData] = useState(null);
  const [learningVideoUserData, setLearningVideoUserData] = useState(null);

  const completedVideos = useMemo(() => {
    return toSafeNumber(learningVideoUserData?.completed_videos);
  }, [learningVideoUserData]);

  const navigate = useNavigate();

  /**
   * Navigate to a video detail page.
   *
   * @param {any} video - Video object.
   * @returns {void}
   */
  function handleOpenVideo(video) {
    const videoId = video?.id;
    if (!videoId) {
      return;
    }
    navigate(`/videos/${videoId}`);
  }

  const activeDates = useMemo(() => {
    return Array.isArray(userData?.active_dates) ? userData.active_dates : [];
  }, [userData]);

    useEffect(() => {
      let aborted = false;

      markDailyActiveAndGetUserData()
        .then((data) => {
          if (aborted) {
            return;
          }
          setUserData(data || null);
        })
        .catch(() => {
          // silently fail
        });

      return () => {
        aborted = true;
      };
    }, []);


    useEffect(() => {
      let aborted = false;

      fetchLearningVideoUserData()
        .then((data) => {
          if (aborted) {
            return;
          }
          setLearningVideoUserData(data || null);
        })
        .catch(() => {
          // silently fail
        });

      return () => {
        aborted = true;
      };
    }, []);

  useEffect(() => {
    let aborted = false;

    async function loadVideos() {
      try {
        setLoadingVideos(true);
        setVideosErrorText("");

        const response = await fetchVideoList({
          ordering: "-created_at",
        });

        if (aborted) {
          return;
        }

        const results = Array.isArray(response?.results) ? response.results : [];
        setVideos(results);
      } catch (err) {
        if (aborted) {
          return;
        }
        setVideosErrorText(err?.message ? String(err.message) : "Unknown error");
      } finally {
        if (!aborted) {
          setLoadingVideos(false);
        }
      }
    }

    loadVideos();

    return () => {
      aborted = true;
    };
  }, []);

  const totalVideoCount = useMemo(() => {
    return Array.isArray(videos) ? videos.length : 0;
  }, [videos]);

  const activeDays = useMemo(() => {
    return toSafeNumber(userData?.active_days);
  }, [userData]);

    const stats = useMemo(() => {
      return buildStats(totalVideoCount, completedVideos, activeDays);
    }, [totalVideoCount, completedVideos, activeDays]);

  return (
    <div className="home-layout">
      <div className="home-left">
        <StatsCard stats={stats} />
        <CalendarCard activeDates={userData?.active_dates || []} maxPastMonths={3} />
        <LearningMessagesCard />
      </div>

      <div className="home-right">
        <VideoFilter />
        <VideoGrid
          videos={videos}
          loading={loadingVideos}
          errorText={videosErrorText}
          onVideoClick={handleOpenVideo}
        />
      </div>
    </div>
  );
}
