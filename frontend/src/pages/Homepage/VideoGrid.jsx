import "./VideoGrid.css";
import "./LockedVideoAlert.css";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import useMaxWidth from "../../hooks/useMaxWidth.js";
import VideoCard from "./VideoCard.jsx";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPurchaseModalHtml(module) {
  const image = module?.image
    ? `<img class="module-purchase-modal__image" src="${escapeHtml(module.image)}" alt="${escapeHtml(module.title)}" />`
    : "";
  const labels = Array.isArray(module?.purchaseLabels) && module.purchaseLabels.length
    ? `<div class="module-purchase-modal__labels">${module.purchaseLabels
        .map((item) => `<span class="module-purchase-modal__label">${escapeHtml(item)}</span>`)
        .join("")}</div>`
    : "";
  const description = module?.purchaseDescription
    ? `<p class="module-purchase-modal__description">${escapeHtml(module.purchaseDescription)}</p>`
    : "";
  const features = Array.isArray(module?.purchaseFeatures) && module.purchaseFeatures.length
    ? `<ul class="module-purchase-modal__list">${module.purchaseFeatures
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ul>`
    : "";

  return `
    <div class="module-purchase-modal">
      ${image}
      ${labels}
      ${description}
      ${features}
    </div>
  `;
}

/**
 * VideoGrid
 * - Pure layout component
 */
export default function VideoGrid({
  videos,
  loading,
  errorText,
  module,
  onVideoClick,
  videoMarkById,
  onInitLoadMark,
  onToggleFavorite,
  onToggleCompleted,
}) {
  const navigate = useNavigate();
  const isMobileView = useMaxWidth(990);

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
            onClick={async () => {
              if (isLocked) {
                if (module?.id) {
                  if (isMobileView) {
                    navigate(`/modules/${module.id}/preview`);
                    return;
                  }

                  const result = await Swal.fire({
                    title: module?.title || "暂未解锁",
                    html: buildPurchaseModalHtml(module),
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: "立刻购买",
                    denyButtonText: "立刻试用",
                    cancelButtonText: "稍后再看",
                    customClass: {
                      popup: "module-purchase-modal-popup",
                      title: "module-purchase-modal-title",
                      htmlContainer: "module-purchase-modal-container",
                      actions: "module-purchase-modal-actions",
                      confirmButton: "module-purchase-modal-confirm",
                      denyButton: "module-purchase-modal-confirm",
                      cancelButton: "module-purchase-modal-cancel",
                    },
                    buttonsStyling: false,
                    width: 720,
                  });

                  if (result.isConfirmed) {
                    navigate(`/modules/${module.id}/purchase`);
                    return;
                  }

                  if (result.isDenied && module?.route) {
                    navigate(module.route);
                    return;
                  }
                }
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
