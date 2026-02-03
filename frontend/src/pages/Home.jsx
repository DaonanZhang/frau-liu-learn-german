import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import StatsCard from "../pages/Homepage/components/StatsCard.jsx";
import CalendarCard from "../pages/Homepage/components/CalendarCard";
import LearningMessagesCard from "../pages/Homepage/components/LearningMessagesCard";

import VideoFilter from "../pages/Homepage/VideoFilter";
import VideoGrid from "../pages/Homepage/VideoGrid";

import { fetchVideoList } from "../api/learning_by_video/videos.js";
import { markDailyActiveAndGetUserData } from "../api/user_data/userData";
import { fetchLearningVideoUserData } from "../api/learning_by_video/userData";

import {
  fetchUserVideoMarkByVideoId,
  setVideoFavorite,
  setVideoCompleted,
} from "../api/learning_by_video/mark_videos.js";

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
 * @param {number} completedVideos - Total video completed.
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

/**
 * Hook: track whether viewport is <= maxWidth.
 *
 * @param {number} maxWidth - Max viewport width in px.
 * @returns {boolean} True when viewport matches.
 */
function useMaxWidth(maxWidth) {
  const [isMatch, setIsMatch] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);

    const update = () => {
      setIsMatch(Boolean(mediaQuery.matches));
    };

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => {
        mediaQuery.removeEventListener("change", update);
      };
    }

    mediaQuery.addListener(update);
    return () => {
      mediaQuery.removeListener(update);
    };
  }, [maxWidth]);

  return isMatch;
}

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videosErrorText, setVideosErrorText] = useState("");

  const [userData, setUserData] = useState(null);
  const [learningVideoUserData, setLearningVideoUserData] = useState(null);
  const navigate = useNavigate();

  const [videoMarkById, setVideoMarkById] = useState({});
  const requestedMarkIdsRef = useRef(new Set());

  const isMobileView = useMaxWidth(990);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isMobileView) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobileView]);

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

    if (isMobileView) {
      setIsMobileSidebarOpen(false);
    }

    navigate(`/videos/${videoId}`);
  }

  async function handleInitLoadMark(videoId) {
    const parsedVideoId = Number(videoId);
    if (!Number.isFinite(parsedVideoId) || parsedVideoId <= 0) {
      return;
    }

    if (videoMarkById?.[parsedVideoId]) {
      return;
    }

    if (requestedMarkIdsRef.current.has(parsedVideoId)) {
      return;
    }
    requestedMarkIdsRef.current.add(parsedVideoId);

    try {
      const mark = await fetchUserVideoMarkByVideoId(parsedVideoId);
      setVideoMarkById((previous) => ({
        ...previous,
        [parsedVideoId]: mark,
      }));
    } catch {
      requestedMarkIdsRef.current.delete(parsedVideoId);
      // silently fail
    }
  }

  async function handleToggleFavorite(video) {
    const parsedVideoId = Number(video?.id);
    if (!Number.isFinite(parsedVideoId) || parsedVideoId <= 0) {
      return;
    }

    const current = videoMarkById?.[parsedVideoId];
    const nextValue = !Boolean(current?.is_favorite);

    try {
      const updated = await setVideoFavorite(parsedVideoId, nextValue);

      setVideoMarkById((previous) => ({
        ...previous,
        [parsedVideoId]: updated,
      }));

      setLearningVideoUserData((previous) => {
        if (!previous) {
          return previous;
        }

        const previousCount = toSafeNumber(previous.favorite_count);
        const nextCount = nextValue
          ? previousCount + 1
          : Math.max(0, previousCount - 1);

        return {
          ...previous,
          favorite_count: nextCount,
        };
      });
    } catch {
      // silently fail
    }
  }

  async function handleToggleCompleted(video) {
    const parsedVideoId = Number(video?.id);
    if (!Number.isFinite(parsedVideoId) || parsedVideoId <= 0) {
      return;
    }

    const current = videoMarkById?.[parsedVideoId];
    const nextValue = !Boolean(current?.is_completed);

    try {
      const updated = await setVideoCompleted(parsedVideoId, nextValue);

      setVideoMarkById((previous) => ({
        ...previous,
        [parsedVideoId]: updated,
      }));

      setLearningVideoUserData((previous) => {
        if (!previous) {
          return previous;
        }

        const previousCount = toSafeNumber(previous.completed_count);
        const nextCount = nextValue
          ? previousCount + 1
          : Math.max(0, previousCount - 1);

        return {
          ...previous,
          completed_count: nextCount,
        };
      });
    } catch {
      // silently fail
    }
  }

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

  const completedVideos = useMemo(() => {
    return toSafeNumber(learningVideoUserData?.completed_count);
  }, [learningVideoUserData]);

  const activeDays = useMemo(() => {
    return toSafeNumber(userData?.active_days);
  }, [userData]);

  const stats = useMemo(() => {
    return buildStats(totalVideoCount, completedVideos, activeDays);
  }, [totalVideoCount, completedVideos, activeDays]);

  return (
    <div className={`home-layout ${isMobileView ? "home-layout--mobile" : ""}`}>
      <div
        className={`home-mobile-overlay ${
          isMobileView && isMobileSidebarOpen ? "home-mobile-overlay--open" : ""
        }`}
        role="button"
        tabIndex={0}
        onClick={() => {
          setIsMobileSidebarOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsMobileSidebarOpen(false);
          }
        }}
      />

      <aside
        className={`home-left ${
          isMobileView ? "home-left--drawer" : ""
        } ${isMobileView && isMobileSidebarOpen ? "home-left--open" : ""}`}
        aria-hidden={isMobileView && !isMobileSidebarOpen}
      >
        <div className="home-left-content">
          {isMobileView && (
            <div className="home-drawer-header">
              <div className="home-drawer-title">学习面板</div>
              <button
                className="home-drawer-close"
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                }}
                aria-label="Close drawer"
              >
                ✕
              </button>
            </div>
          )}

          <StatsCard stats={stats} />
          <CalendarCard activeDates={userData?.active_dates || []} maxPastMonths={3} />
          <LearningMessagesCard />

          {isMobileView && (
            <div className="home-mobile-filter">
              <VideoFilter />
            </div>
          )}
        </div>
      </aside>

      <main className="home-right">
        {isMobileView && (
          <div
            className="home-mobile-toolbar"
            role="button"
            tabIndex={0}
            onClick={() => {
              setIsMobileSidebarOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setIsMobileSidebarOpen(true);
              }
            }}
          >
            <div className="home-mobile-toolbar-content">
              <span className="home-mobile-toolbar-icon">☰</span>
              <span className="home-mobile-toolbar-text">学习面板</span>
            </div>
          </div>
        )}

        {!isMobileView && <VideoFilter />}

        <VideoGrid
          videos={videos}
          loading={loadingVideos}
          errorText={videosErrorText}
          onVideoClick={handleOpenVideo}
          videoMarkById={videoMarkById}
          onInitLoadMark={handleInitLoadMark}
          onToggleFavorite={handleToggleFavorite}
          onToggleCompleted={handleToggleCompleted}
        />
      </main>
    </div>
  );
}
