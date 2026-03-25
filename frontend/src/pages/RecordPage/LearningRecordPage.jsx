import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import VideoGrid from "../Homepage/VideoGrid.jsx";

import {
  fetchFavoriteVideoMarks,
  fetchCompletedVideoMarks,
  fetchUserVideoMarkByVideoId,
  setVideoFavorite,
  setVideoCompleted,
} from "../../api/learning_by_video/mark_videos";

import { fetchVideoDetail } from "../../api/learning_by_video/videos";

import "./LearningRecordPage.css";

/**
 * Safely convert an unknown value into a positive integer id.
 *
 * @param {unknown} value - Input value.
 * @returns {number|null} Positive integer or null.
 */
function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const integerValue = Math.trunc(parsed);
  if (integerValue <= 0) {
    return null;
  }
  return integerValue;
}

/**
 * Extract unique video ids from mark records.
 *
 * @param {Array<{video?: number|string|null}>} marks - Mark records.
 * @returns {number[]} Unique video ids.
 */
function extractUniqueVideoIds(marks) {
  if (!Array.isArray(marks)) {
    return [];
  }

  const idSet = new Set();
  for (const mark of marks) {
    const videoId = toPositiveInteger(mark?.video);
    if (videoId) {
      idSet.add(videoId);
    }
  }
  return Array.from(idSet);
}

/**
 * Fetch video objects for a list of video ids.
 * This uses per-id detail fetching to avoid backend assumptions.
 *
 * @param {number[]} videoIds - Video ids.
 * @returns {Promise<any[]>} Video objects.
 */
async function fetchVideosByIds(videoIds) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return [];
  }

  const results = await Promise.all(
    videoIds.map(async (videoId) => {
      try {
        const video = await fetchVideoDetail(videoId);
        return video || null;
      } catch {
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

/**
 * Build a stable mapping from id -> mark object.
 *
 * @param {Array<{video?: number|string|null}>} marks - Mark records.
 * @returns {Record<number, any>} Map by video id.
 */
function buildMarkMap(marks) {
  const mapping = {};
  if (!Array.isArray(marks)) {
    return mapping;
  }

  for (const mark of marks) {
    const videoId = toPositiveInteger(mark?.video);
    if (videoId) {
      mapping[videoId] = mark;
    }
  }

  return mapping;
}

export default function LearningRecordPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("completed"); // "completed" | "favorite"

  const [loadingState, setLoadingState] = useState("loading"); // loading | ready | error
  const [errorText, setErrorText] = useState("");

  const [completedVideos, setCompletedVideos] = useState([]);
  const [favoriteVideos, setFavoriteVideos] = useState([]);

  const [videoMarkById, setVideoMarkById] = useState({});
  const requestedMarkIdsRef = useRef(new Set());

  const currentVideos = useMemo(() => {
    if (activeTab === "favorite") {
      return favoriteVideos;
    }
    return completedVideos;
  }, [activeTab, completedVideos, favoriteVideos]);


  function handleOpenVideo(video) {
    const videoId = toPositiveInteger(video?.id);
    if (!videoId) {
      return;
    }
    navigate(`/videos/${videoId}`);
  }

  async function handleInitLoadMark(videoId) {
    const parsedVideoId = toPositiveInteger(videoId);
    if (!parsedVideoId) {
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
    }
  }

  async function handleToggleFavorite(video) {
    const parsedVideoId = toPositiveInteger(video?.id);
    if (!parsedVideoId) {
      return;
    }

    const current = videoMarkById?.[parsedVideoId];
    const nextValue = !current?.is_favorite;

    try {
      const updated = await setVideoFavorite(parsedVideoId, nextValue);

      setVideoMarkById((previous) => ({
        ...previous,
        [parsedVideoId]: updated,
      }));

      setFavoriteVideos((previous) => {
        const exists = previous.some((item) => Number(item?.id) === parsedVideoId);

        if (nextValue) {
          if (exists) {
            return previous;
          }
          return [video, ...previous];
        }

        return previous.filter((item) => Number(item?.id) !== parsedVideoId);
      });
    } catch {
      // silently fail
    }
  }

  async function handleToggleCompleted(video) {
    const parsedVideoId = toPositiveInteger(video?.id);
    if (!parsedVideoId) {
      return;
    }

    const current = videoMarkById?.[parsedVideoId];
    const nextValue = !current?.is_completed;

    try {
      const updated = await setVideoCompleted(parsedVideoId, nextValue);

      setVideoMarkById((previous) => ({
        ...previous,
        [parsedVideoId]: updated,
      }));

      setCompletedVideos((previous) => {
        const exists = previous.some((item) => Number(item?.id) === parsedVideoId);

        if (nextValue) {
          if (exists) {
            return previous;
          }
          return [video, ...previous];
        }

        return previous.filter((item) => Number(item?.id) !== parsedVideoId);
      });
    } catch {
      // silently fail
    }
  }


  useEffect(() => {
    let aborted = false;

    async function loadRecordData() {
      try {
        setLoadingState("loading");
        setErrorText("");

        const [completedMarks, favoriteMarks] = await Promise.all([
          fetchCompletedVideoMarks(),
          fetchFavoriteVideoMarks(),
        ]);

        if (aborted) {
          return;
        }

        const completedMarkList = Array.isArray(completedMarks) ? completedMarks : [];
        const favoriteMarkList = Array.isArray(favoriteMarks) ? favoriteMarks : [];

        const completedIds = extractUniqueVideoIds(completedMarkList);
        const favoriteIds = extractUniqueVideoIds(favoriteMarkList);

        const [completedVideoList, favoriteVideoList] = await Promise.all([
          fetchVideosByIds(completedIds),
          fetchVideosByIds(favoriteIds),
        ]);

        if (aborted) {
          return;
        }

        setCompletedVideos(completedVideoList);
        setFavoriteVideos(favoriteVideoList);

        const mergedMarks = {
          ...buildMarkMap(completedMarkList),
          ...buildMarkMap(favoriteMarkList),
        };
        setVideoMarkById(mergedMarks);

        setLoadingState("ready");
      } catch (error) {
        if (aborted) {
          return;
        }
        setErrorText(error?.message ? String(error.message) : "Unknown error");
        setLoadingState("error");
      }
    }

    loadRecordData();

    return () => {
      aborted = true;
    };
  }, []);

  const tabCounts = useMemo(() => {
    return {
      completed: Array.isArray(completedVideos) ? completedVideos.length : 0,
      favorite: Array.isArray(favoriteVideos) ? favoriteVideos.length : 0,
    };
  }, [completedVideos, favoriteVideos]);

  return (
    <div className="record-page">
      <header className="record-header">
        <button
          className="record-header__back"
          type="button"
          onClick={() => {
            navigate("/");
          }}
          aria-label="Back to home"
        >
          ←
        </button>
        <div className="record-header__title">学习记录</div>
        <div className="record-header__spacer" />
      </header>

      <div className="record-tabs">
        <button
          className={[
            "record-tab",
            activeTab === "completed" ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={() => {
            setActiveTab("completed");
          }}
        >
          已完成
          <span className="record-tab__count">{tabCounts.completed}</span>
        </button>

        <button
          className={[
            "record-tab",
            activeTab === "favorite" ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={() => {
            setActiveTab("favorite");
          }}
        >
          已收藏
          <span className="record-tab__count">{tabCounts.favorite}</span>
        </button>
      </div>

      <main className="record-content">
        {loadingState === "error" ? (
          <div className="record-state">Failed to load: {errorText}</div>
        ) : (
          <VideoGrid
            videos={currentVideos}
            loading={loadingState === "loading"}
            errorText=""
            onVideoClick={handleOpenVideo}
            videoMarkById={videoMarkById}
            onInitLoadMark={handleInitLoadMark}
            onToggleFavorite={handleToggleFavorite}
            onToggleCompleted={handleToggleCompleted}
          />
        )}
      </main>
    </div>
  );
}
