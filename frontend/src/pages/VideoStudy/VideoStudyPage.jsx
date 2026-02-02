import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./VideoStudyPage.css";
import { fetchVideoDetail } from "../../api/learning_by_video/videos.js";
import SubtitlePanel from "./components/SubtitlePanel.jsx";
import LexiconPanel from "./components/LexiconPanel.jsx";
import ExercisePanel from "./components/ExercisePanel.jsx";


/**
 * Format duration seconds into mm:ss or h:mm:ss.
 */
function formatDurationLabel(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s <= 0) return "";

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}


export default function VideoStudyPage() {
  const { videoId } = useParams();
  const videoRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [videoErrorText, setVideoErrorText] = useState("");

  const [playbackSettings, setPlaybackSettings] = useState({
    videoMode: "single_play",      // "single_play" | "single_loop"
    sentenceMode: "continuous",    // "continuous" | "loop"
    loopCount: 1,                  // number | "infinite"
    autoNext: false,
  });

  /**
   * Controls whether the lexicon (word) panel is visible.
   *
   * @type {[boolean, Function]}
   */
  const [isLexiconOpen, setIsLexiconOpen] = useState(true);

  const [isMobile, setIsMobile] = useState(false);

  const [isExerciseOpen, setIsExerciseOpen] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia("(max-width: 1023px)");

    function syncMobileState() {
      setIsMobile(mediaQueryList.matches);
    }

    syncMobileState();

    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener("change", syncMobileState);
      return () => {
        mediaQueryList.removeEventListener("change", syncMobileState);
      };
    }

    // Safari fallback
    mediaQueryList.addListener(syncMobileState);
    return () => {
      mediaQueryList.removeListener(syncMobileState);
    };
  }, []);

  const leftTitle = video?.title ?? "";
  const leftDuration = video?.duration_seconds ? formatDurationLabel(video.duration_seconds) : "";
  const leftDifficulty = video?.difficulty ?? "";
  const leftDescription = video?.description ?? "";
  const leftVideoUrl = video?.video_url ?? "";


  const loopRef = useRef({
    enabled: false,
    start: 0,
    end: 0,
    remaining: 0,
    infinite: false,
    lastLoopAt: 0,
  });

  /**
   * Apply video-level looping behavior.
   *
   * - single_play  -> play once, stop at end
   * - single_loop  -> restart video automatically when ended
   */
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.loop = playbackSettings.videoMode === "single_loop";
  }, [playbackSettings.videoMode]);

  useEffect(() => {
    if (playbackSettings.sentenceMode !== "loop") {
      loopRef.current.enabled = false;
    }
  }, [playbackSettings.sentenceMode]);

  /**
   * Start looping the selected subtitle segment if sentence loop mode is enabled.
   *
   * @param {number} index - Index of the subtitle in subtitleItems array.
   * @returns {void}
   */
  function startSentenceLoopIfEnabled(index) {
    const el = videoRef.current;
    if (!el) {
      return;
    }

    if (playbackSettings.sentenceMode !== "loop") {
      return;
    }

    if (index < 0 || index >= subtitleItems.length) {
      return;
    }

    const s = subtitleItems[index];
    const start = Number(s?.start ?? 0);
    const end = Number(s?.end ?? 0);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return;
    }

    const infinite = playbackSettings.loopCount === "infinite";
    const remaining = infinite ? 0 : Number(playbackSettings.loopCount ?? 1);

    loopRef.current.enabled = true;
    loopRef.current.start = start;
    loopRef.current.end = end;
    loopRef.current.infinite = infinite;
    loopRef.current.remaining = remaining;
    loopRef.current.lastLoopAt = 0;

    el.currentTime = start;
  }

  /**
   * Start playing a subtitle segment by index, and apply sentence looping if enabled.
   *
   * @param {number} index
   * @returns {void}
   */
  function playSubtitleByIndex(index) {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (index < 0 || index >= subtitleItems.length) {
      return;
    }

    const start = Number(subtitleItems[index]?.start ?? 0);
    if (!Number.isFinite(start)) {
      return;
    }

    setActiveSubtitleIndex(index);
    activeSubtitleIndexRef.current = index;
    videoElement.currentTime = start;

    if (playbackSettings.sentenceMode === "loop") {
      startSentenceLoopIfEnabled(index);
    } else {
      loopRef.current.enabled = false;
    }

    videoElement.play();
  }


  const [subtitleItems, setSubtitleItems] = useState([]);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);

  const activeSubtitleIndexRef = useRef(-1);

  useEffect(() => {
    activeSubtitleIndexRef.current = activeSubtitleIndex;
  }, [activeSubtitleIndex]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    function syncActiveSubtitleByTime() {
      const nextIndex = findSubtitleIndexByTime(videoElement.currentTime);

      setActiveSubtitleIndex((prevIndex) => {
        if (nextIndex === prevIndex) {
          return prevIndex;
        }
        return nextIndex;
      });
    }


    function handleSentenceLoopTick() {
      const loopState = loopRef.current;

      if (!loopState.enabled) {
        return;
      }


      if (playbackSettings.sentenceMode !== "loop") {
        loopState.enabled = false;
        return;
      }

      if (videoElement.currentTime >= loopState.end - 0.05) {
        const now = performance.now();
        if (now - loopState.lastLoopAt < 250) {
          return;
        }
        loopState.lastLoopAt = now;
        if (loopState.infinite) {
          videoElement.currentTime = loopState.start;
          return;
        }

        // finite looping: remaining means "how many MORE repeats to do"
        if (loopState.remaining > 0) {
          loopState.remaining -= 1;
          videoElement.currentTime = loopState.start;
          return;
        }

        loopState.enabled = false;

        if (playbackSettings.autoNext) {
          const currentIndex = activeSubtitleIndexRef.current;
          const nextIndex = currentIndex + 1;

          if (nextIndex >= 0 && nextIndex < subtitleItems.length) {
            playSubtitleByIndex(nextIndex);
            return;
          }
        }

        videoElement.pause();
      }
    }

    function onTimeUpdate() {
      handleSentenceLoopTick();
      syncActiveSubtitleByTime();
    }

    videoElement.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      videoElement.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [
    leftVideoUrl,
    playbackSettings.sentenceMode,
    playbackSettings.loopCount,
    playbackSettings.autoNext,
    subtitleItems,
  ]);

  useEffect(() => {
    let aborted = false;

    async function loadVideo() {
      try {
        setLoadingVideo(true);
        setVideoErrorText("");

        const data = await fetchVideoDetail(videoId, { includeSubtitles: false });

        if (aborted) return;
        setVideo(data);
      } catch (err) {
        if (aborted) return;
        const msg = err?.message ? String(err.message) : "Failed to load video detail";
        setVideoErrorText(msg);
      } finally {
        if (!aborted) setLoadingVideo(false);
      }
    }

    if (videoId) loadVideo();

    return () => {
      aborted = true;
    };
  }, [videoId]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    function onPlay() {
      if (subtitleItems.length <= 0) {
        return;
      }

      const byTime = findSubtitleIndexByTime(videoElement.currentTime);

      if (byTime !== -1) {
        setActiveSubtitleIndex(byTime);

        if (playbackSettings.sentenceMode === "loop") {
          startSentenceLoopIfEnabled(byTime);
        }
        return;
      }

      const first = subtitleItems[0];
      setActiveSubtitleIndex(0);
      videoElement.currentTime = Number(first.start || 0);

      if (playbackSettings.sentenceMode === "loop") {
        startSentenceLoopIfEnabled(0);
      }
    }

    videoElement.addEventListener("play", onPlay);

    return () => {
      videoElement.removeEventListener("play", onPlay);
    };
  }, [leftVideoUrl, subtitleItems, playbackSettings.sentenceMode]);


  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    function onSeeked() {
      const nextIndex = findSubtitleIndexByTime(videoElement.currentTime);
      setActiveSubtitleIndex((prevIndex) => {
        if (nextIndex === prevIndex) {
          return prevIndex;
        }

        if (playbackSettings.sentenceMode === "loop" && nextIndex !== -1) {
          startSentenceLoopIfEnabled(nextIndex);
        } else {
          loopRef.current.enabled = false;
        }

        return nextIndex;
      });
    }

    videoElement.addEventListener("seeked", onSeeked);

    return () => {
      videoElement.removeEventListener("seeked", onSeeked);
    };
  }, [leftVideoUrl, playbackSettings.sentenceMode, subtitleItems]);


  /**
   * Find subtitle index by current playback time.
   * Uses [start, end) interval matching with a small tolerance.
   *
   * @param {number} currentTimeSeconds
   * @returns {number}
   */
  function findSubtitleIndexByTime(currentTimeSeconds) {
    const t = Number(currentTimeSeconds ?? 0);
    if (!Number.isFinite(t)) {
      return -1;
    }

    const tolerance = 0.03;

    for (let index = 0; index < subtitleItems.length; index += 1) {
      const start = Number(subtitleItems[index]?.start ?? 0);
      const end = Number(subtitleItems[index]?.end ?? 0);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        continue;
      }

      if (t >= start - tolerance && t < end + tolerance) {
        return index;
      }
    }

    for (let index = subtitleItems.length - 1; index >= 0; index -= 1) {
      const start = Number(subtitleItems[index]?.start ?? 0);
      if (!Number.isFinite(start)) {
        continue;
      }

      if (t >= start - tolerance) {
        return index;
      }
    }

    return -1;
  }
  function handleSeek(seconds) {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const targetTime = Number(seconds || 0);
    videoElement.currentTime = targetTime >= 0 ? targetTime : 0;

    const index = findSubtitleIndexByTime(targetTime);

    setActiveSubtitleIndex(index);
    activeSubtitleIndexRef.current = index;

    if (playbackSettings.sentenceMode === "loop" && index !== -1) {
      startSentenceLoopIfEnabled(index);
      videoElement.play();
      return;
    }

    loopRef.current.enabled = false;

  }

  const durationLabel = leftDuration ? `时长：${leftDuration}` : "时长：-";
  const difficultyLabel = leftDifficulty ? `难度：${leftDifficulty}` : "难度：-";

  const shouldShowExercisePanel = isExerciseOpen;

  const shouldShowSubtitlePanel = !shouldShowExercisePanel && (!isMobile || !isLexiconOpen);
  const shouldShowLexiconPanel = !shouldShowExercisePanel && isLexiconOpen;

  return (
    <div className="vs-page">
      <div
        className={[
          "vs-grid",
          (!isLexiconOpen || isExerciseOpen) ? "vs-grid--no-right" : "",
          isExerciseOpen ? "vs-grid--exercise" : "",
        ].filter(Boolean).join(" ")}
      >

        {/* Left: video player */}
        <section className="vs-left">
          <div className="vs-playerCard">
            <div className="vs-playerHeader">
              <Link to="/" className="vs-backBtn" aria-label="Back">
                ‹
              </Link>

              <div className="vs-titleRow">
                <div className="vs-title">{loadingVideo ? "Loading…" : leftTitle || "Untitled"}</div>

                <div className="vs-meta">
                  <span>{durationLabel}</span>
                  <span className="vs-dot">·</span>
                  <span>{difficultyLabel}</span>
                </div>
              </div>
            </div>

            <div className="vs-player">
              {videoErrorText ? (
                <div className="vs-playerPlaceholder">
                  <div className="vs-playerPlaceholderText">Failed to load video: {videoErrorText}</div>
                </div>
              ) : leftVideoUrl ? (
                <video
                  ref={videoRef}
                  className="vs-playerPlaceholder"
                  controls
                  preload="metadata"
                  src={leftVideoUrl}
                />
              ) : (
                <div className="vs-playerPlaceholder">
                  <div className="vs-playerPlaceholderText">
                    {loadingVideo ? "Loading video…" : "Video URL is empty"}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="vs-descCard">
            <div className="vs-descTitle">视频简介</div>
            <div className="vs-descText">{loadingVideo ? "Loading…" : leftDescription || "暂无简介"}</div>
          </div>

            <div className="vs-descActions">
              <button
                type="button"
                className="vs-exerciseBtn"
                onClick={() => {
                  setIsExerciseOpen((prevValue) => {
                    return !prevValue;
                  });

                  // optional but recommended: when entering exercise mode, keep lexicon closed for a stable layout
                  if (!isExerciseOpen) {
                    setIsLexiconOpen(false);
                  }
                }}
                disabled={loadingVideo || !videoId}
              >
                {isExerciseOpen ? "跟读模式" : "练习模式"}
              </button>
            </div>
        </section>

        {/* Middle: subtitles */}
        {shouldShowSubtitlePanel ? (
          <SubtitlePanel
            videoId={videoId}
            videoTitle={leftTitle}
            videoRef={videoRef}
            onSeek={handleSeek}
            onSubtitlesLoaded={(items) => setSubtitleItems(items)}
            playbackSettings={playbackSettings}
            onPlaybackSettingsChange={(patch) =>
              setPlaybackSettings((prev) => ({ ...prev, ...patch }))
            }
            isLexiconOpen={isLexiconOpen}
            onToggleLexicon={() => {
              setIsLexiconOpen((prevValue) => !prevValue);
            }}
            activeSubtitleIndex={activeSubtitleIndex}
          />
        ) : null}

        {/* Right: lexicon*/}
        {shouldShowLexiconPanel ? (
          <section className="vs-right">
            <LexiconPanel
              videoId={videoId}
              subtitleItems={subtitleItems}
              activeSubtitleIndex={activeSubtitleIndex}
              onSeek={handleSeek}
              onClose={() => {
                setIsLexiconOpen(false);
              }}
            />
          </section>
        ) : null}


        {shouldShowExercisePanel ? (
          <section className="vs-right">
            <ExercisePanel
              isOpen={isExerciseOpen}
              onClose={() => {
                setIsExerciseOpen(false);
              }}
              videoId={videoId}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
