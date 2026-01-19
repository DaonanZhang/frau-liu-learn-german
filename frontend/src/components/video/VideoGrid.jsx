import "./VideoGrid.css";
import VideoCard from "./VideoCard";

/**
 * VideoGrid
 * - Pure layout component
 */
export default function VideoGrid({ videos, loading, errorText }) {
  if (loading) {
    return <div className="video-grid__state">Loading videos…</div>;
  }

  if (errorText) {
    return <div className="video-grid__state">Failed to load videos: {errorText}</div>;
  }

  if (!videos || videos.length === 0) {
    return <div className="video-grid__state">No videos available</div>;
  }

  return (
    <div className="video-grid">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} />
      ))}
    </div>
  );
}
