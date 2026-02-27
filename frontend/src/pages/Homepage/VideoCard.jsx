import { useEffect, useMemo, useState } from "react";
import "./VideoCard.css";

function getCoverCandidates(base) {
  const normalized = typeof base === "string" ? base.trim() : "";
  if (!normalized) {
    return [];
  }
  if (/\.png$/i.test(normalized)) {
    return [normalized, normalized.replace(/\.png$/i, ".jpg")];
  }
  if (/\.jpe?g$/i.test(normalized)) {
    return [normalized, normalized.replace(/\.jpe?g$/i, ".png")];
  }
  return [`${normalized}.png`, `${normalized}.jpg`];
}

function getCoverCandidatesFromVideo(video) {
  const rawList = video?.cover_letter_urls;
  const candidates = [];

  if (Array.isArray(rawList)) {
    rawList.forEach((item) => {
      candidates.push(...getCoverCandidates(item));
    });
  } else if (typeof rawList === "string" && rawList.trim()) {
    candidates.push(...getCoverCandidates(rawList));
  }

  candidates.push(...getCoverCandidates(video?.cover_letter_url));

  const seen = new Set();
  return candidates.filter((item) => {
    if (!item || seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

function formatDuration(seconds) {
  const secondsNumber = Number(seconds || 0);
  if (!Number.isFinite(secondsNumber) || secondsNumber <= 0) {
    return "";
  }
  const minutes = Math.max(1, Math.round(secondsNumber / 60));
  return `${minutes}分钟`;
}

function formatDate(dateStr) {
  if (!dateStr) {
    return "";
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function normalizeTagValue(raw) {
  if (!raw) {
    return [];
  }
  const quoteTrim = /^[\"'“”‘’]+|[\"'“”‘’]+$/g;
  return String(raw)
    .split(/[,\uFF0C\u3001]/)
    .map((part) => part.trim().replace(quoteTrim, ""))
    .filter(Boolean);
}

function getTopicTags(video) {
  const raw = video?.tags;
  const collected = [];
  if (Array.isArray(raw)) {
    raw.forEach((item) => collected.push(...normalizeTagValue(item)));
  } else {
    collected.push(...normalizeTagValue(raw));
  }
  return [...new Set(collected)];
}

function HeartIcon({ filled }) {
  return (
    <svg
      className="video-card__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="
          M12 21
          C12 21 4 15.5 2.8 11.6
          C1.7 8.1 3.6 5.2 6.2 5.2
          C8.1 5.2 9.9 6.4 10.8 8
          C11.2 8.6 12.8 8.6 13.2 8
          C14.1 6.4 15.9 5.2 17.8 5.2
          C20.4 5.2 22.3 8.1 21.2 11.6
          C20 15.5 12 21 12 21
          Z
        "
        className={filled ? "video-card__icon-fill" : "video-card__icon-stroke"}
      />
    </svg>
  );
}

function CheckIcon({ filled }) {
  return (
    <svg
      className="video-card__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 6.7l-9.1 9.2L4 9.9"
        className={filled ? "video-card__icon-check-filled" : "video-card__icon-check"}
      />
      <path
        d="M21 12c0 5-4 9-9 9s-9-4-9-9s4-9 9-9"
        className={filled ? "video-card__icon-circle-filled" : "video-card__icon-circle"}
      />
    </svg>
  );
}

/**
 * VideoCard
 * - Presentational with minimal side-effect:
 *   calls `onInitLoadMark(videoId)` once on mount to allow parent to fetch mark state.
 *
 * Props:
 * - video: video object
 * - onClick: open video
 * - isFavorite: whether this video is favorited
 * - isCompleted: whether this video is completed
 * - onToggleFavorite: callback(video)
 * - onToggleCompleted: callback(video)
 * - onInitLoadMark: callback(videoId) for initial mark state loading
 */
export default function VideoCard({
  video,
  onClick,
  isLocked = false,
  isFavorite = false,
  isCompleted = false,
  onToggleFavorite,
  onToggleCompleted,
  onInitLoadMark,
}) {
  const videoId = useMemo(() => {
    const idValue = Number(video?.id);
    if (Number.isFinite(idValue) && idValue > 0) {
      return idValue;
    }
    return null;
  }, [video]);

  useEffect(() => {
    if (!videoId) {
      return;
    }
    if (!onInitLoadMark) {
      return;
    }
    onInitLoadMark(videoId);
  }, [videoId, onInitLoadMark]);

  const coverCandidates = useMemo(
    () => getCoverCandidatesFromVideo(video),
    [video?.cover_letter_url, video?.cover_letter_urls]
  );
  const coverKey = coverCandidates.join("|");
  const [coverIndex, setCoverIndex] = useState(0);
  const coverSrc = coverCandidates[coverIndex] || "";
  const durationLabel = formatDuration(video?.duration_seconds);
  const dateLabel = formatDate(video?.created_at);
  const topicTags = useMemo(() => getTopicTags(video), [video?.tags]);

  useEffect(() => {
    setCoverIndex(0);
  }, [coverKey]);

  const shouldKeepActionsVisible = Boolean(isFavorite || isCompleted);

  return (
    <article className={["video-card", isLocked ? "video-card--locked" : ""].join(" ")}>
      <div
        className="video-card__media"
        onClick={isLocked ? undefined : onClick}
        role="button"
        tabIndex={isLocked ? -1 : 0}
        aria-disabled={isLocked ? "true" : "false"}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!isLocked && onClick) {
              onClick();
            }
          }
        }}
      >
        {coverSrc ? (
          <img
            className="video-card__cover"
            src={coverSrc}
            alt={video?.title || "video"}
            onError={() => {
              if (coverIndex + 1 < coverCandidates.length) {
                setCoverIndex(coverIndex + 1);
              }
            }}
          />
        ) : (
          <div className="video-card__cover video-card__cover--placeholder" />
        )}

        <div className="video-card__overlay" aria-hidden="true" />

        {isLocked ? (
          <div className="video-card__lock" aria-label="locked">
            <svg
              className="video-card__lock-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M7 10V7.5C7 4.46 9.46 2 12.5 2S18 4.46 18 7.5V10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <rect x="5" y="10" width="14" height="12" rx="2.2" />
            </svg>
            <span className="video-card__lock-text">暂未解锁</span>
          </div>
        ) : null}

        {durationLabel ? (
          <div className="video-card__duration">{durationLabel}</div>
        ) : null}

        <div
          className={[
            "video-card__quick-actions",
            shouldKeepActionsVisible ? "is-persistent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            className={[
              "video-card__quick-btn",
              isFavorite ? "is-active is-favorite" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-label={isFavorite ? "Unfavorite video" : "Favorite video"}
            onClick={(event) => {
              event.stopPropagation();
              if (!isLocked && onToggleFavorite) {
                onToggleFavorite(video);
              }
            }}
            disabled={isLocked}
          >
            <HeartIcon filled={Boolean(isFavorite)} />
            <span className="video-card__quick-label">收藏</span>
          </button>

          <div className="video-card__quick-divider" aria-hidden="true" />

          <button
            className={[
              "video-card__quick-btn",
              isCompleted ? "is-active is-completed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-label={isCompleted ? "Unmark completed" : "Mark as completed"}
            onClick={(event) => {
              event.stopPropagation();
              if (!isLocked && onToggleCompleted) {
                onToggleCompleted(video);
              }
            }}
            disabled={isLocked}
          >
            <CheckIcon filled={Boolean(isCompleted)} />
            <span className="video-card__quick-label">完成</span>
          </button>
        </div>
      </div>

      <div className="video-card__body">
        <div className="video-card__title">{video?.title}</div>

        {video?.description ? (
          <div className="video-card__desc">{video.description}</div>
        ) : null}

        <div className="video-card__meta">
          <div className="video-card__chips">
            {video?.creator ? (
              <span className="chip chip--blue">👤 {video.creator}</span>
            ) : null}
            {video?.difficulty ? (
              <span className="chip chip--gold">⭐ {video.difficulty}</span>
            ) : null}
            {topicTags.map((tag) => (
              <span className="chip chip--mint" key={`tag-${tag}`}>
                {tag}
              </span>
            ))}
          </div>

          {dateLabel ? <div className="video-card__date">{dateLabel}</div> : null}
        </div>
      </div>
    </article>
  );
}
