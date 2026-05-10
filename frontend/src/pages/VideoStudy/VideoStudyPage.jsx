import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { useLocation, useParams, Link } from "react-router-dom";
import "./VideoStudyPage.css";
import { fetchVideoDetail } from "../../api/learning_by_video/videos.js";
import SubtitlePanel from "./components/SubtitlePanel.jsx";
import LexiconPanel from "./components/LexiconPanel.jsx";
import ExercisePanel from "./components/ExercisePanel.jsx";
import VideoNotePanel from "./components/VideoNotePanel.jsx";
import { useAuth } from "../../api/auth/useAuth.js";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";


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

function isProbablyHlsUrl(url) {
  if (!url) return false;
  return /\.m3u8($|[?#])/i.test(url);
}

function getSeasonReturnPath(seasonNumber) {
  const parsedSeasonNumber = Number(seasonNumber);
  if (!Number.isFinite(parsedSeasonNumber) || parsedSeasonNumber <= 0) {
    return "/";
  }

  if (parsedSeasonNumber === 4) {
    return "/modules/vlog-season";
  }

  if (parsedSeasonNumber >= 1 && parsedSeasonNumber <= 3) {
    return "/modules/science-season";
  }

  return "/";
}

function userHasSeasonAccess(user, seasonNumber) {
  if (!user) {
    return false;
  }

  if (user.is_staff || user.is_superuser || user.has_platform_wide_access) {
    return true;
  }

  const normalizedSeasonNumber = Number(seasonNumber);
  if (!Number.isFinite(normalizedSeasonNumber) || normalizedSeasonNumber <= 0) {
    return false;
  }

  const entitlements = Array.isArray(user.entitlements) ? user.entitlements : [];
  return entitlements.some((item) => {
    if (!item?.is_valid_now) {
      return false;
    }

    const scope = String(item.scope || "");
    if (scope === "platform") {
      return true;
    }

    if (item?.module?.key !== "learning_by_video") {
      return false;
    }

    if (!item?.season) {
      return true;
    }

    const entitledSeasonNumber = Number(item.season?.season_number);
    if (entitledSeasonNumber === normalizedSeasonNumber) {
      return true;
    }

    if (normalizedSeasonNumber === 2 && entitledSeasonNumber === 1) {
      return true;
    }

    return false;
  });
}

export default function VideoStudyPage() {
  const { videoId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [videoErrorText, setVideoErrorText] = useState("");
  const [playbackErrorText, setPlaybackErrorText] = useState("");

  const [playbackSettings, setPlaybackSettings] = useState({
    videoMode: "single_play",      // "single_play" | "single_loop"
    sentenceMode: "continuous",    // "continuous" | "loop"
    loopCount: 1,                  // number | "infinite"
    autoNext: false,
    playbackRate: 1,
  });

  /**
   * Controls whether the lexicon (word) panel is visible.
   *
   * @type {[boolean, Function]}
   */
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  const [isExerciseOpen, setIsExerciseOpen] = useState(false);
  const [openVideoNotePanel, setOpenVideoNotePanel] = useState(null);
  const [lexiconFocusRequest, setLexiconFocusRequest] = useState(null);
  const [panelShape, setPanelShape] = useState("normal");
  useBodyScrollLock(isMobile && (isLexiconOpen || isExerciseOpen));

  const handleVideoNoteOpenRequestReady = useCallback((openFn) => {
    setOpenVideoNotePanel(() => openFn);
  }, []);

  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const pipDragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: null,
  });
  const mobileFabRef = useRef(null);
  const [mobileFabOffset, setMobileFabOffset] = useState({ x: 0, y: 0 });
  const fabDragRef = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: null,
    rafId: null,
    pendingOffset: null,
  });

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

  useEffect(() => {
    if (isMobile) {
      setIsLexiconOpen(false);
    }
  }, [isMobile]);

  function clampMobileFabOffset(nextX, nextY) {
    if (typeof window === "undefined") {
      return { x: nextX, y: nextY };
    }

    const fabElement = mobileFabRef.current;
    const fabWidth = fabElement?.offsetWidth || 68;
    const fabHeight = fabElement?.offsetHeight || 56;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;

    const baseRight = 16; // matches `.vs-mobileFab { right: 1rem; }`
    const baseBottom = 88; // close to `5.5rem`, ignoring safe-area extra
    const edgePadding = 8;

    const rawMinX = -(viewportWidth - fabWidth - edgePadding - baseRight);
    const rawMaxX = baseRight - edgePadding;
    const rawMinY = -(viewportHeight - fabHeight - edgePadding - baseBottom);
    const rawMaxY = baseBottom - edgePadding;

    const minX = Math.min(rawMinX, rawMaxX);
    const maxX = Math.max(rawMinX, rawMaxX);
    const minY = Math.min(rawMinY, rawMaxY);
    const maxY = Math.max(rawMinY, rawMaxY);

    return {
      x: Math.min(maxX, Math.max(minX, nextX)),
      y: Math.min(maxY, Math.max(minY, nextY)),
    };
  }

  useEffect(() => {
    if (!isMobile) {
      setMobileFabOffset({ x: 0, y: 0 });
      return () => {};
    }

    function clampFabWithinViewport() {
      setMobileFabOffset((prevOffset) => {
        const clamped = clampMobileFabOffset(prevOffset.x, prevOffset.y);
        if (clamped.x === prevOffset.x && clamped.y === prevOffset.y) {
          return prevOffset;
        }
        return clamped;
      });
    }

    clampFabWithinViewport();
    window.addEventListener("resize", clampFabWithinViewport);
    return () => {
      window.removeEventListener("resize", clampFabWithinViewport);
    };
  }, [isMobile]);

  useEffect(() => {
    const dragState = fabDragRef.current;
    return () => {
      if (dragState.rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(dragState.rafId);
        dragState.rafId = null;
      }
    };
  }, []);

  const leftTitle = video?.title ?? "";
  const leftDuration = video?.duration_seconds ? formatDurationLabel(video.duration_seconds) : "";
  const leftDifficulty = video?.difficulty ?? "";
  const leftDescription = video?.description ?? "";
  const leftCreator = video?.creator ?? "";
  const leftVideoUrl = video?.video_url ?? "";
  const isHlsUrl = useMemo(() => isProbablyHlsUrl(leftVideoUrl), [leftVideoUrl]);
  const playerErrorText = videoErrorText || playbackErrorText;
  const backPath = useMemo(() => {
    const requestedReturnPath = String(location.state?.returnTo || "").trim();
    if (requestedReturnPath) {
      return requestedReturnPath;
    }

    return getSeasonReturnPath(video?.season_number);
  }, [location.state, video?.season_number]);
  const isTrialBadgeVisible = useMemo(() => {
    if (!video?.is_free_preview) {
      return false;
    }

    return !userHasSeasonAccess(user, video?.season_number);
  }, [user, video?.is_free_preview, video?.season_number]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }
    videoElement.setAttribute("playsinline", "");
    videoElement.setAttribute("webkit-playsinline", "");
  }, [leftVideoUrl]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return () => {};
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setPlaybackErrorText("");

    if (!leftVideoUrl) {
      videoElement.removeAttribute("src");
      try {
        videoElement.load();
      } catch {
        // ignore
      }
      return () => {};
    }

    if (!isHlsUrl) {
      videoElement.src = leftVideoUrl;
      try {
        videoElement.load();
      } catch {
        // ignore
      }
      return () => {};
    }

    const canPlayNativeHls = Boolean(videoElement.canPlayType("application/vnd.apple.mpegurl"));
    if (canPlayNativeHls) {
      videoElement.src = leftVideoUrl;
      try {
        videoElement.load();
      } catch {
        // ignore
      }
      return () => {};
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(leftVideoUrl);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          setPlaybackErrorText("HLS playback error.");
          hls.destroy();
          hlsRef.current = null;
        }
      });
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }

    setPlaybackErrorText("This browser does not support HLS playback.");
    return () => {};
  }, [leftVideoUrl, isHlsUrl]);

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
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }
    const rate = Number(playbackSettings.playbackRate || 1);
    videoElement.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  }, [playbackSettings.playbackRate, leftVideoUrl]);

  useEffect(() => {
    if (playbackSettings.sentenceMode !== "loop") {
      loopRef.current.enabled = false;
    }
  }, [playbackSettings.sentenceMode]);

  const [subtitleItems, setSubtitleItems] = useState([]);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);

  const activeSubtitleIndexRef = useRef(-1);

  /**
   * Find subtitle index by current playback time.
   * Uses [start, end) interval matching with a small tolerance.
   *
   * @param {number} currentTimeSeconds
   * @returns {number}
   */
  const findSubtitleIndexByTime = useCallback((currentTimeSeconds) => {
    const t = Number(currentTimeSeconds ?? 0);
    if (!Number.isFinite(t)) {
      return -1;
    }

    const tolerance = 0.03;
    let bestIndex = -1;
    let bestStart = -Infinity;

    for (let index = 0; index < subtitleItems.length; index += 1) {
      const start = Number(subtitleItems[index]?.start ?? 0);
      const end = Number(subtitleItems[index]?.end ?? 0);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        continue;
      }

      if (t >= start - tolerance && t < end + tolerance) {
        if (start > bestStart) {
          bestStart = start;
          bestIndex = index;
        }
      }
    }

    if (bestIndex !== -1) {
      return bestIndex;
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
  }, [subtitleItems]);

  /**
   * Start looping the selected subtitle segment if sentence loop mode is enabled.
   *
   * @param {number} index - Index of the subtitle in subtitleItems array.
   * @returns {void}
   */
  const startSentenceLoopIfEnabled = useCallback((index) => {
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
  }, [playbackSettings.sentenceMode, playbackSettings.loopCount, subtitleItems]);

  /**
   * Start playing a subtitle segment by index, and apply sentence looping if enabled.
   *
   * @param {number} index
   * @returns {void}
   */
  const playSubtitleByIndex = useCallback((index) => {
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
  }, [playbackSettings.sentenceMode, startSentenceLoopIfEnabled, subtitleItems]);

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
    findSubtitleIndexByTime,
    playSubtitleByIndex,
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
  }, [leftVideoUrl, subtitleItems, playbackSettings.sentenceMode, findSubtitleIndexByTime, startSentenceLoopIfEnabled]);


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
  }, [leftVideoUrl, playbackSettings.sentenceMode, subtitleItems, findSubtitleIndexByTime, startSentenceLoopIfEnabled]);


  function handleSeek(seconds, options = {}) {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    const resumeIfPaused = options?.resumeIfPaused === true;
    const wasPausedBeforeSeek = videoElement.paused;
    const targetTime = Number(seconds || 0);
    videoElement.currentTime = targetTime >= 0 ? targetTime : 0;

    const index = findSubtitleIndexByTime(targetTime);

    setActiveSubtitleIndex(index);
    activeSubtitleIndexRef.current = index;

    if (playbackSettings.sentenceMode === "loop" && index !== -1) {
      startSentenceLoopIfEnabled(index);
      const playResult = videoElement.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {});
      }
      return;
    }

    loopRef.current.enabled = false;

    if (resumeIfPaused && wasPausedBeforeSeek) {
      const playResult = videoElement.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {});
      }
    }

  }

  const durationLabel = leftDuration ? `时长：${leftDuration}` : "时长：-";
  const difficultyLabel = leftDifficulty ? `难度：${leftDifficulty}` : "难度：-";

  const shouldShowExercisePanel = isExerciseOpen;

  const shouldShowSubtitlePanel = !shouldShowExercisePanel;
  const shouldShowLexiconPanel = !shouldShowExercisePanel && isLexiconOpen;

  function pauseVideoIfPlaying() {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    if (!videoElement.paused && !videoElement.ended) {
      videoElement.pause();
    }
  }

  function handleLexiconFocusRequest(nextFocus) {
    if (!nextFocus || !nextFocus.key || !nextFocus.kind) {
      return;
    }

    if (isMobile) {
      pauseVideoIfPlaying();
    }

    setIsLexiconOpen(true);
    setLexiconFocusRequest({
      key: String(nextFocus.key),
      kind: nextFocus.kind,
      nonce: Date.now(),
    });
  }

  function handlePipPointerDown(event) {
    if (!isMobile || panelShape !== "shadowing") {
      return;
    }
    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }

    const state = pipDragRef.current;
    state.dragging = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.originX = pipOffset.x;
    state.originY = pipOffset.y;
    state.pointerId = event.pointerId;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  function handlePipPointerMove(event) {
    const state = pipDragRef.current;
    if (!state.dragging) {
      return;
    }

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    setPipOffset({
      x: state.originX + dx,
      y: state.originY + dy,
    });
  }

  function handlePipPointerUp(event) {
    const state = pipDragRef.current;
    if (!state.dragging) {
      return;
    }
    state.dragging = false;

    try {
      if (state.pointerId !== null) {
        event.currentTarget.releasePointerCapture(state.pointerId);
      }
    } catch {
      // ignore
    }
  }

  function handleMobileFabPointerDown(event) {
    if (!isMobile) {
      return;
    }
    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }

    const state = fabDragRef.current;
    state.dragging = true;
    state.moved = false;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.originX = mobileFabOffset.x;
    state.originY = mobileFabOffset.y;
    state.pointerId = event.pointerId;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  function handleMobileFabPointerMove(event) {
    const state = fabDragRef.current;
    if (!state.dragging) {
      return;
    }

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      state.moved = true;
    }

    state.pendingOffset = clampMobileFabOffset(state.originX + dx, state.originY + dy);
    if (state.rafId !== null) {
      return;
    }

    state.rafId = window.requestAnimationFrame(() => {
      state.rafId = null;
      if (state.pendingOffset) {
        setMobileFabOffset(state.pendingOffset);
      }
    });
  }

  function handleMobileFabPointerUp(event) {
    const state = fabDragRef.current;
    if (!state.dragging) {
      return;
    }
    state.dragging = false;

    try {
      if (state.pointerId !== null) {
        event.currentTarget.releasePointerCapture(state.pointerId);
      }
    } catch {
      // ignore
    }

    if (state.rafId !== null) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (state.pendingOffset) {
      setMobileFabOffset(state.pendingOffset);
      state.pendingOffset = null;
    }
  }

  function handleMobileFabToggle() {
    const state = fabDragRef.current;
    if (state.moved) {
      state.moved = false;
      return;
    }

    setIsExerciseOpen((prevValue) => {
      const nextValue = !prevValue;
      if (nextValue) {
        setIsLexiconOpen(false);
      }
      return nextValue;
    });
  }

  return (
    <div className="vs-page">
      <div
        className={[
          "vs-grid",
          (!isLexiconOpen || isExerciseOpen) ? "vs-grid--no-right" : "",
          isExerciseOpen ? "vs-grid--exercise" : "",
          isMobile ? "vs-grid--mobile" : "",
        ].filter(Boolean).join(" ")}
      >

        {/* Left: video player */}
        <section className="vs-left">
          <div
            className={[
              "vs-playerCard",
              isMobile && panelShape === "shadowing" ? "vs-playerCard--pip" : "",
            ].filter(Boolean).join(" ")}
            style={
              isMobile && panelShape === "shadowing"
                ? { transform: `translate(${pipOffset.x}px, ${pipOffset.y}px)` }
                : undefined
            }
            onPointerDown={handlePipPointerDown}
            onPointerMove={handlePipPointerMove}
            onPointerUp={handlePipPointerUp}
            onPointerCancel={handlePipPointerUp}
          >
            <div className="vs-playerHeader">
              <Link to={backPath} className="vs-backBtn" aria-label="Back">
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
              {isTrialBadgeVisible ? (
                <div className="vs-previewBadge" aria-label="免费试用">
                  免费试用
                </div>
              ) : null}

              {playerErrorText ? (
                <div className="vs-playerPlaceholder">
                  <div className="vs-playerPlaceholderText">Failed to load video: {playerErrorText}</div>
                </div>
              ) : leftVideoUrl ? (
                <video
                  ref={videoRef}
                  className="vs-playerPlaceholder"
                  controls={!isMobile}
                  playsInline
                  controlsList="nodownload"
                  onContextMenu={(event) => event.preventDefault()}
                  preload="metadata"
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

          {!isMobile ? (
            <div className="vs-descCard">
              <div className="vs-descTitle">视频简介</div>
              <div className="vs-descText">{loadingVideo ? "Loading…" : leftDescription || "暂无简介"}</div>
              {!loadingVideo ? (
                <div className="vs-descSource">
                  {leftCreator
                    ? `本期视频素材来源于 YouTube 频道 ${leftCreator}。本平台仅对视频语料进行深度的教学加工，视频版权归原博主所有。`
                    : "本期视频素材来源于 YouTube。本平台仅对视频语料进行深度的教学加工，视频版权归原博主所有。"}
                </div>
              ) : null}
            </div>
          ) : null}

          {!isMobile ? (
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
          ) : null}

          <VideoNotePanel
            videoId={videoId}
            showTrigger={!isMobile}
            onOpenRequestReady={handleVideoNoteOpenRequestReady}
          />
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
            videoUrl={leftVideoUrl}
            isLexiconOpen={isLexiconOpen}
            onToggleLexicon={() => {
              setIsLexiconOpen((prevValue) => {
                const nextValue = !prevValue;
                if (nextValue && isMobile) {
                  pauseVideoIfPlaying();
                }
                return nextValue;
              });
            }}
            onRequestLexiconFocus={handleLexiconFocusRequest}
            activeSubtitleIndex={activeSubtitleIndex}
            panelShape={panelShape}
            onPanelShapeChange={(nextShape) => {
              setPanelShape(nextShape);
            }}
            isMobile={isMobile}
            onOpenVideoNotes={() => {
              openVideoNotePanel?.();
            }}
          />
        ) : null}

        {/* Right: lexicon*/}
        {shouldShowLexiconPanel ? (
          <section className={isMobile ? "vs-right vs-right--page" : "vs-right"}>
            <LexiconPanel
              videoId={videoId}
              subtitleItems={subtitleItems}
              activeSubtitleIndex={activeSubtitleIndex}
              onSeek={handleSeek}
              focusRequest={lexiconFocusRequest}
              onClose={() => {
                setIsLexiconOpen(false);
              }}
            />
          </section>
        ) : null}


        {shouldShowExercisePanel ? (
          <section className={isMobile ? "vs-right vs-right--modal vs-right--modal--clear" : "vs-right"}>
            <ExercisePanel
              isOpen={isExerciseOpen}
              onClose={() => {
                setIsExerciseOpen(false);
              }}
              videoId={videoId}
              seasonNumber={video?.season_number ?? null}
            />
          </section>
        ) : null}
      </div>

      {isMobile ? (
        <button
          ref={mobileFabRef}
          type="button"
          className="vs-mobileFab"
          style={{ transform: `translate(${mobileFabOffset.x}px, ${mobileFabOffset.y}px)` }}
          onPointerDown={handleMobileFabPointerDown}
          onPointerMove={handleMobileFabPointerMove}
          onPointerUp={handleMobileFabPointerUp}
          onPointerCancel={handleMobileFabPointerUp}
          onClick={handleMobileFabToggle}
          aria-label="Toggle exercise mode"
        >
          <span className="vs-mobileFabIcon" aria-hidden="true">
            题
          </span>
          <span className="vs-mobileFabLabel">题目</span>
        </button>
      ) : null}
    </div>
  );
}
