import "./VideoGrid.css";
import "./LockedVideoAlert.css";
import Swal from "sweetalert2";
import VideoCard from "./VideoCard.jsx";

const PURCHASE_URL = "https://xhslink.com/m/7dqIcM8QWof";

async function showLockedVideoAlert() {
  await Swal.fire({
    title: "暂未解锁",
    html:
      '点击 <a class="locked-video-alert__link" href="' +
      PURCHASE_URL +
      '" target="_blank" rel="noopener noreferrer">购买</a>，解锁全部50期学习资料哦，永久有效！',
    confirmButtonText: "好的",
    customClass: {
      popup: "locked-video-alert",
      title: "locked-video-alert__title",
      htmlContainer: "locked-video-alert__content",
      actions: "locked-video-alert__actions",
      confirmButton: "locked-video-alert__button",
    },
    buttonsStyling: false,
  });
}

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
        const isLocked = Boolean(video?.is_locked);

        return (
          <VideoCard
            key={video.id}
            video={video}
            onClick={() => {
              if (isLocked) {
                showLockedVideoAlert();
                return;
              }
              onVideoClick?.(video);
            }}
            isLocked={isLocked}
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
