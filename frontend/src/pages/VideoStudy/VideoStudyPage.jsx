import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import "./VideoStudyPage.css";
import { fetchVideoDetail } from "../../api/learning_by_video/videos.js";
import SubtitlePanel from "./SubtitlePanel";

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


  const loopRef = useRef({
    enabled: false,
    start: 0,
    end: 0,
    remaining: 0,
    infinite: false,
  });


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

    el.currentTime = start;
  }


  const [subtitleItems, setSubtitleItems] = useState([]);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    function onTimeUpdate() {
      const cfg = loopRef.current;
      if (!cfg.enabled) return;

      if (el.currentTime >= cfg.end - 0.05) {
        if (cfg.infinite) {
          el.currentTime = cfg.start;
          return;
        }

        cfg.remaining -= 1;

        if (cfg.remaining > 0) {
          el.currentTime = cfg.start;
          return;
        }

        // Loop finished
        cfg.enabled = false;

        if (playbackSettings.autoNext) {
          // Move to next subtitle
          const nextIndex = activeSubtitleIndex + 1;
          if (nextIndex >= 0 && nextIndex < subtitleItems.length) {
            const next = subtitleItems[nextIndex];
            setActiveSubtitleIndex(nextIndex);
            el.currentTime = Number(next.start || 0);
            startSentenceLoopIfEnabled(nextIndex);
          }
        }
      }
    }

    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [playbackSettings.autoNext, activeSubtitleIndex, subtitleItems]);

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


  /**
   * Seek the HTMLVideoElement to a given time (seconds).
   * This must live inside the component to access videoRef.
   */
  function handleSeek(seconds) {
    if (!videoRef.current) return;
    const t = Number(seconds || 0);
    videoRef.current.currentTime = t >= 0 ? t : 0;
    const idx = subtitleItems.findIndex((x) => Number(x.start) === t);
    setActiveSubtitleIndex(idx);

    if (playbackSettings.sentenceMode === "loop" && idx !== -1) {
      startSentenceLoopIfEnabled(idx);
    } else {
      loopRef.current.enabled = false;
    }
  }

  /**
   * Find subtitle by start time using a small tolerance to avoid float equality issues.
   *
   * @param {number} target - Target time in seconds.
   * @returns {number}
   */
  function findSubtitleIndexByStart(target) {
    const tolerance = 0.02;
    return subtitleItems.findIndex((x) => {
      const s = Number(x?.start ?? 0);
      return Math.abs(s - target) <= tolerance;
    });
  }

  const leftTitle = video?.title ?? "";
  const leftDuration = video?.duration_seconds ? formatDurationLabel(video.duration_seconds) : "";
  const leftDifficulty = video?.difficulty ?? "";
  const leftDescription = video?.description ?? "";
  const leftVideoUrl = video?.video_url ?? "";

  const durationLabel = leftDuration ? `时长：${leftDuration}` : "时长：-";
  const difficultyLabel = leftDifficulty ? `难度：${leftDifficulty}` : "难度：-";

  const mockLexicon = useMemo(
    () => [
      {
        word: "futuristic",
        ipa: "/ˌfjuː.tʃərˈɪs.tɪk/",
        pos: "adj.",
        meaning: "未来感的；超前的",
        extra: "ultramodern, forward-looking",
        exampleEn: "Shanghai, China's futuristic megacity.",
        exampleZh: "上海，中国充满未来感的特大城市。",
      },
      {
        word: "megacity",
        ipa: "/ˈmeɡəˌsɪti/",
        pos: "n.",
        meaning: "特大城市；超级城市",
        extra: "metropolis, urban center",
        exampleEn: "Shanghai, China's futuristic megacity.",
        exampleZh: "上海，中国充满未来感的特大城市。",
      },
    ],
    []
  );

  return (
    <div className="vs-page">
      <div className={["vs-grid", !isLexiconOpen ? "vs-grid--no-right" : ""].filter(Boolean).join(" ")}>
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
        </section>

        {/* Middle: subtitles */}
        <section className="vs-middle">
          <SubtitlePanel
            videoId={videoId}
            onSeek={handleSeek}
            onSubtitlesLoaded={(items) => setSubtitleItems(items)}
            playbackSettings={playbackSettings}
            onPlaybackSettingsChange={(patch) =>
              setPlaybackSettings((prev) => ({ ...prev, ...patch }))
            }
          />
        </section>

        {/* Right: lexicon*/}
        {isLexiconOpen ? (
          <section className="vs-right">
            <div className="vs-panel">
              <div className="vs-rightHeader">
                <div className="vs-rightHeaderTop">
                  <div className="vs-rightHeaderTitle">单词面板</div>

                  <button
                    className="vs-rightCollapseBtn"
                    type="button"
                    aria-label="Collapse lexicon panel"
                    onClick={() => setIsLexiconOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="vs-tabs">
                  <button className="vs-tab is-active" type="button">
                    单词 (29)
                  </button>
                  <button className="vs-tab" type="button">
                    短语 (10)
                  </button>
                  <button className="vs-tab" type="button">
                    地道表达 (6)
                  </button>
                </div>

                <div className="vs-subTabs">
                  <button className="vs-subTab is-active" type="button">
                    全部 (29)
                  </button>
                  <button className="vs-subTab" type="button">
                    未标记 (29)
                  </button>
                  <button className="vs-subTab" type="button">
                    认识 (0)
                  </button>
                  <button className="vs-subTab" type="button">
                    不认识 (0)
                  </button>
                </div>

                <div className="vs-actionsRow">
                  <button className="vs-actionBtn" type="button">
                    👁 隐藏中文
                  </button>
                  <button className="vs-actionBtn is-primary" type="button">
                    👁 隐藏标注
                  </button>
                </div>
              </div>

              <div className="vs-lexList">
                {mockLexicon.map((x) => (
                  <article key={x.word} className="vs-lexCard">
                    <div className="vs-lexTop">
                      <div className="vs-lexWord">{x.word}</div>
                      <button className="vs-audioBtn" type="button" aria-label="Play audio">
                        🔊
                      </button>
                    </div>

                    <div className="vs-lexIpa">{x.ipa}</div>

                    <div className="vs-lexMeaning">
                      <span className="vs-lexPos">{x.pos}</span> <span>{x.meaning}</span>
                    </div>

                    <div className="vs-lexExtra">{x.extra}</div>

                    <div className="vs-lexExample">
                      <div className="vs-lexExampleEn">“{x.exampleEn}”</div>
                      <div className="vs-lexExampleZh">“{x.exampleZh}”</div>
                    </div>

                    <div className="vs-lexFooter">
                      <button className="vs-lexBtn" type="button">
                        📌 点选跳转
                      </button>
                      <button className="vs-eyeBtn" type="button" aria-label="Toggle visibility">
                        👁
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
