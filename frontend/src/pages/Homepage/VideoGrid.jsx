import "./VideoGrid.css";
import VideoCard from "./VideoCard.jsx";

/**
 * VideoGrid
 * - Pure layout component
 */
export default function VideoGrid({
  videos,
  loading,
  errorText,
  onVideoClick,
  videoMarkById,
  onInitLoadMark,
  onToggleFavorite,
  onToggleCompleted,
}) {
  if (loading) {
    return <div className="video-grid__state">Loading videos…</div>;
  }

  if (errorText) {
    return (
      <div className="video-grid__state">
        Failed to load videos: {errorText}
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return <div className="video-grid__state"></div>;
  }

  return (
    <div className="video-grid">
      {videos.map((video) => {
        const videoId = Number(video?.id);
        const mark = Number.isFinite(videoId) ? videoMarkById?.[videoId] : null;

        return (
          <VideoCard
            key={video.id}
            video={video}
            onClick={() => {
              onVideoClick?.(video);
            }}
            isFavorite={Boolean(mark?.is_favorite)}
            isCompleted={Boolean(mark?.is_completed)}
            onToggleFavorite={onToggleFavorite}
            onToggleCompleted={onToggleCompleted}
            onInitLoadMark={onInitLoadMark}
          />
        );
      })}
    </div>
  );
}
