import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchVideoList } from "../api/learning_by_video/videos.js";
import { fetchVideoMeta } from "../api/learning_by_video/video_meta.js";
import { markDailyActiveAndGetUserData } from "../api/user_data/userData";
import {
  fetchUserVideoMarkByVideoId,
  setVideoFavorite,
  setVideoCompleted,
} from "../api/learning_by_video/mark_videos.js";
import useMaxWidth from "../hooks/useMaxWidth.js";
import HomeSidebarContent from "./Homepage/HomeSidebarContent.jsx";
import StatsCard from "./Homepage/components/StatsCard.jsx";
import VideoFilter from "./Homepage/VideoFilter";
import VideoGrid from "./Homepage/VideoGrid";
import { SCIENCE_SEASON_MODULE, buildStats, toSafeNumber } from "./Homepage/homeShared.js";

import "./ModulePage.css";

function buildDurationBuckets(rawDurations) {
  const lookup = new Map();
  if (!Array.isArray(rawDurations)) {
    return { options: [], lookup };
  }

  rawDurations.forEach((value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    const minutes = Math.max(1, Math.round(seconds / 60));
    const existing = lookup.get(minutes) || [];
    existing.push(seconds);
    lookup.set(minutes, existing);
  });

  const options = Array.from(lookup.keys()).sort((a, b) => a - b);
  return { options, lookup };
}

function parseTitleSequence(titleValue) {
  const rawTitle = String(titleValue || "").trim();
  if (!rawTitle) {
    return { baseTitle: "", sequence: null };
  }

  const normalizedTitle = rawTitle.replace(/（/g, "(").replace(/）/g, ")");
  const matched = normalizedTitle.match(/^(.*?)(?:\s*\((\d+)\))\s*$/);
  if (!matched) {
    return { baseTitle: rawTitle, sequence: null };
  }

  const sequence = Number(matched[2]);
  return {
    baseTitle: (matched[1] || "").trim(),
    sequence: Number.isFinite(sequence) ? sequence : null,
  };
}

function normalizeTopicMeta(rawTopics) {
  if (!Array.isArray(rawTopics)) {
    return [];
  }

  const results = [];
  const separators = /[,\uFF0C\u3001]/;
  const quoteTrim = /^["'“”‘’]+|["'“”‘’]+$/g;
  rawTopics.forEach((item) => {
    if (item == null) return;
    const str = String(item);
    str.split(separators).forEach((part) => {
      const cleaned = part.trim().replace(quoteTrim, "");
      if (cleaned) {
        results.push(cleaned);
      }
    });
  });

  return Array.from(new Set(results));
}

export default function ModulePage({
  moduleConfig = SCIENCE_SEASON_MODULE,
  seasonNumber = 1,
  seasonNumbers = null,
}) {
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videosErrorText, setVideosErrorText] = useState("");
  const [userData, setUserData] = useState(null);
  const [videoMarkById, setVideoMarkById] = useState({});
  const requestedMarkIdsRef = useRef(new Set());
  const location = useLocation();
  const navigate = useNavigate();

  const [videoMeta, setVideoMeta] = useState({
    difficulties: [],
    creators: [],
    topics: [],
    durations: [],
    totalCount: 0,
  });

  const [selectedDifficulties, setSelectedDifficulties] = useState([]);
  const [selectedCreators, setSelectedCreators] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [selectedDurations, setSelectedDurations] = useState([]);

  const isMobileView = useMaxWidth(990);
  const effectiveSeasonNumbers = useMemo(() => {
    if (Array.isArray(seasonNumbers) && seasonNumbers.length) {
      return seasonNumbers;
    }
    if (Array.isArray(moduleConfig?.seasonNumbers) && moduleConfig.seasonNumbers.length) {
      return moduleConfig.seasonNumbers;
    }
    return [seasonNumber];
  }, [moduleConfig, seasonNumber, seasonNumbers]);

  function handleOpenVideo(video) {
    const videoId = video?.id;
    if (!videoId) {
      return;
    }

    navigate(`/videos/${videoId}`, {
      state: {
        returnTo: location.pathname + location.search + location.hash,
      },
    });
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
    }
  }

  async function handleToggleFavorite(video) {
    const parsedVideoId = Number(video?.id);
    if (!Number.isFinite(parsedVideoId) || parsedVideoId <= 0) {
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
    const nextValue = !current?.is_completed;

    try {
      const updated = await setVideoCompleted(parsedVideoId, nextValue);

      setVideoMarkById((previous) => ({
        ...previous,
        [parsedVideoId]: updated,
      }));
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    let aborted = false;

    markDailyActiveAndGetUserData()
      .then((data) => {
        if (!aborted) {
          setUserData(data || null);
        }
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

    fetchVideoMeta({ seasonNumbers: effectiveSeasonNumbers })
      .then((data) => {
        if (!aborted) {
          setVideoMeta({
            difficulties: Array.isArray(data?.difficulties) ? data.difficulties : [],
            creators: Array.isArray(data?.creators) ? data.creators : [],
            topics: normalizeTopicMeta(data?.topics),
            durations: Array.isArray(data?.durations) ? data.durations : [],
            totalCount: Number.isFinite(Number(data?.total_count)) ? Number(data.total_count) : 0,
          });
        }
      })
      .catch(() => {
        // silently fail
      });

    return () => {
      aborted = true;
    };
  }, [effectiveSeasonNumbers]);

  const durationBuckets = useMemo(() => {
    return buildDurationBuckets(videoMeta.durations);
  }, [videoMeta.durations]);

  const selectedDurationSeconds = useMemo(() => {
    if (!selectedDurations.length) {
      return [];
    }
    const results = [];
    selectedDurations.forEach((minutesValue) => {
      const minutes = Number(minutesValue);
      if (!Number.isFinite(minutes)) {
        return;
      }
      const bucket = durationBuckets.lookup.get(minutes) || [];
      bucket.forEach((seconds) => results.push(seconds));
    });
    return results;
  }, [selectedDurations, durationBuckets]);

  useEffect(() => {
    if (!selectedDurations.length) {
      return;
    }

    const allowed = new Set(durationBuckets.options);
    const next = selectedDurations.filter((value) => allowed.has(Number(value)));
    if (
      next.length === selectedDurations.length &&
      next.every((value, index) => value === selectedDurations[index])
    ) {
      return;
    }
    setSelectedDurations(next);
  }, [durationBuckets.options, selectedDurations]);

  useEffect(() => {
    let aborted = false;

    async function loadVideos() {
      try {
        setLoadingVideos(true);
        setVideosErrorText("");

        const response = await fetchVideoList({
          seasonNumbers: effectiveSeasonNumbers,
          ordering: "-created_at",
          difficulty: selectedDifficulties,
          creator: selectedCreators,
          topic: selectedTopics,
          duration: selectedDurationSeconds,
        });

        if (!aborted) {
          setVideos(Array.isArray(response?.results) ? response.results : []);
        }
      } catch (err) {
        if (!aborted) {
          setVideosErrorText(err?.message ? String(err.message) : "Unknown error");
        }
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
  }, [effectiveSeasonNumbers, selectedDifficulties, selectedCreators, selectedTopics, selectedDurationSeconds]);

  const totalVideoCount = useMemo(() => {
    if (Number.isFinite(Number(videoMeta.totalCount)) && videoMeta.totalCount > 0) {
      return Number(videoMeta.totalCount);
    }
    return Array.isArray(videos) ? videos.length : 0;
  }, [videoMeta.totalCount, videos]);

  const completedVideos = useMemo(() => {
    if (!Array.isArray(videos) || videos.length === 0) {
      return 0;
    }

    return videos.reduce((count, video) => {
      const videoId = Number(video?.id);
      if (!Number.isFinite(videoId)) {
        return count;
      }
      return count + (videoMarkById?.[videoId]?.is_completed ? 1 : 0);
    }, 0);
  }, [videos, videoMarkById]);
  const activeDays = useMemo(() => toSafeNumber(userData?.active_days), [userData]);
  const stats = useMemo(
    () => buildStats(totalVideoCount, completedVideos, activeDays, { includeActiveDays: false }),
    [totalVideoCount, completedVideos, activeDays]
  );

  const sortedVideos = useMemo(() => {
    if (!Array.isArray(videos) || videos.length === 0) {
      return [];
    }

    return videos
      .map((video, index) => ({
        video,
        index,
        titleInfo: parseTitleSequence(video?.title),
      }))
      .sort((left, right) => {
        const leftLocked = Boolean(left.video?.is_locked);
        const rightLocked = Boolean(right.video?.is_locked);
        if (leftLocked !== rightLocked) {
          return leftLocked ? 1 : -1;
        }

        const leftId = Number(left.video?.id);
        const rightId = Number(right.video?.id);
        const leftMark = Number.isFinite(leftId) ? videoMarkById?.[leftId] : null;
        const rightMark = Number.isFinite(rightId) ? videoMarkById?.[rightId] : null;
        const leftCompleted = Boolean(leftMark?.is_completed);
        const rightCompleted = Boolean(rightMark?.is_completed);
        if (leftCompleted !== rightCompleted) {
          return leftCompleted ? 1 : -1;
        }

        const sameBaseTitle =
          Boolean(left.titleInfo.baseTitle) && left.titleInfo.baseTitle === right.titleInfo.baseTitle;

        if (sameBaseTitle) {
          const leftHasSequence = Number.isFinite(left.titleInfo.sequence);
          const rightHasSequence = Number.isFinite(right.titleInfo.sequence);

          if (leftHasSequence && rightHasSequence && left.titleInfo.sequence !== right.titleInfo.sequence) {
            return left.titleInfo.sequence - right.titleInfo.sequence;
          }
        }

        return left.index - right.index;
      })
      .map((item) => item.video);
  }, [videos, videoMarkById]);

  const filterPanel = (
    <div className="module-filter-wrap">
      <VideoFilter
        difficultyOptions={videoMeta.difficulties}
        durationOptions={durationBuckets.options}
        creatorOptions={videoMeta.creators}
        topicOptions={videoMeta.topics}
        selectedDifficulties={selectedDifficulties}
        selectedDurations={selectedDurations}
        selectedCreators={selectedCreators}
        selectedTopics={selectedTopics}
        onDifficultyChange={setSelectedDifficulties}
        onDurationChange={setSelectedDurations}
        onCreatorChange={setSelectedCreators}
        onTopicChange={setSelectedTopics}
      />
    </div>
  );

  return (
    <div className="module-page">
      <div className={`module-layout ${isMobileView ? "module-layout--mobile" : ""}`}>
        <aside className="module-left">
          <section className="module-stats-card-wrap" aria-label="学习统计">
            <StatsCard stats={stats} compact />
          </section>

          <section className="module-sidebar-panel" aria-label="筛选">
            <div className="module-sidebar-panel__header">
              <h2 className="module-sidebar-panel__title">筛选</h2>
              <p className="module-sidebar-panel__sub">
                按难度、时长、博主和话题快速找到想学的内容
              </p>
            </div>

            <HomeSidebarContent
              stats={stats}
              activeDates={userData?.active_dates || []}
              isMobileView={false}
              showStats={false}
              showCalendar={false}
              showAnnouncement={false}
              showWeChatQr={false}
              extraContent={filterPanel}
            />
          </section>
        </aside>

        <main className="module-right">
          <section className="module-hero" aria-label={`${moduleConfig.title} 模块`}>
            <div className="module-hero__content">
              <div className="module-hero__title-row">
                <h1 className="module-hero__title">{moduleConfig.title}</h1>
                {moduleConfig?.badge ? (
                  <div className="module-hero__badge">{moduleConfig.badge}</div>
                ) : null}
              </div>
              <p className="module-hero__subtitle">{moduleConfig.subtitle}</p>
              {moduleConfig?.description ? (
                <p className="module-hero__description">{moduleConfig.description}</p>
              ) : null}
            </div>
          </section>

          {isMobileView ? (
            <section className="module-mobile-panel" aria-label="筛选">
              <HomeSidebarContent
                stats={stats}
                activeDates={userData?.active_dates || []}
                isMobileView={false}
                statsCompact
                showCalendar={false}
                showAnnouncement={false}
                showWeChatQr={false}
                extraContent={filterPanel}
              />
            </section>
          ) : null}

          <VideoGrid
            videos={sortedVideos}
            loading={loadingVideos}
            errorText={videosErrorText}
            module={moduleConfig}
            onVideoClick={handleOpenVideo}
            videoMarkById={videoMarkById}
            onInitLoadMark={handleInitLoadMark}
            onToggleFavorite={handleToggleFavorite}
            onToggleCompleted={handleToggleCompleted}
          />
        </main>
      </div>
    </div>
  );
}
