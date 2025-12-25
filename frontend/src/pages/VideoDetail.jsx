import { useParams } from "react-router-dom";

export default function VideoDetail() {
  const { videoId } = useParams();

  return (
    <div>
      <h1>Video Detail</h1>
      <p>videoId: {videoId}</p>
      <p>这里将显示播放器 + 动态字幕。</p>
    </div>
  );
}
