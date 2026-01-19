import "./VideoCard.css";

function formatDuration(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s <= 0) return "";
  const minutes = Math.max(1, Math.round(s / 60));
  return `${minutes}分钟`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * VideoCard
 * - Pure presentational component
 * - No routing logic yet; you can add onClick later
 */
export default function VideoCard({
  video,
  onClick,
  isFavorite = false,
  onToggleFavorite,
}) {
  const coverSrc = video.cover_letter_url || "";
  const durationLabel = formatDuration(video.duration_seconds);
  const dateLabel = formatDate(video.created_at);

  return (
    <article className="video-card">
      <div
        className="video-card__media"
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        {coverSrc ? (
          <img
            className="video-card__cover"
            src={coverSrc}
            alt={video.title || "video"}
          />
        ) : (
          <div className="video-card__cover video-card__cover--placeholder" />
        )}

        {durationLabel ? (
          <div className="video-card__duration">{durationLabel}</div>
        ) : null}

        <button
          className="video-card__fav"
          type="button"
          aria-label="Toggle favorite"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.(video);
          }}
        >
        <span
          className={[
            "video-card__fav-icon",
            isFavorite ? "is-on" : "",
          ].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          ♡
        </span>
        </button>
      </div>

      <div className="video-card__body">
        <div className="video-card__title">{video.title}</div>

        {video.description ? (
          <div className="video-card__desc">{video.description}</div>
        ) : null}

        <div className="video-card__meta">
          <div className="video-card__chips">
            {video.creator ? (
              <span className="chip chip--blue">👤 {video.creator}</span>
            ) : null}
            {video.difficulty ? (
              <span className="chip chip--gold">⭐ {video.difficulty}</span>
            ) : null}
          </div>

          {dateLabel ? <div className="video-card__date">{dateLabel}</div> : null}
        </div>
      </div>
    </article>
  );
}
