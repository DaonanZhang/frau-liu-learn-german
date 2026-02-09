import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSubtitlesByVideo } from "../../../api/learning_by_video/subtitles.js";
import {
  fetchWordOccurrences,
  fetchSentenceOccurrences,
  fetchExpressionOccurrences,
} from "../../../api/learning_by_video/occurrences.js";
import { ShadowingPracticeBar } from "./ShadowingPracticeBar.jsx";
import ExportSubtitlesModal from "./ExportSubtitlesModal.jsx";
import FillInExerciseModal from "./FillInExerciseModal.jsx";

/**
 * Format seconds to m:ss or h:mm:ss.
 */
function formatTime(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s < 0) {
    return "0:00";
  }

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * Compute merged match ranges for patterns in text (case-insensitive).
 *
 * @param {string} text - Source text.
 * @param {string[]} patterns - Patterns to match.
 * @returns {{start: number, end: number}[]} Merged ranges.
 */
function computeMergedRanges(text, patterns) {
  const safeText = String(text || "");
  if (!safeText) {
    return [];
  }
  if (!patterns || patterns.length === 0) {
    return [];
  }

  const lower = safeText.toLowerCase();
  const ranges = [];

  patterns.forEach((pattern) => {
    const normalizedPattern = String(pattern ?? "").trim();
    if (!normalizedPattern) {
      return;
    }

    const patternLower = normalizedPattern.toLowerCase();
    let startIndex = 0;

    while (startIndex < lower.length) {
      const idx = lower.indexOf(patternLower, startIndex);
      if (idx === -1) {
        break;
      }

      ranges.push({ start: idx, end: idx + patternLower.length });
      startIndex = idx + patternLower.length;
    }
  });

  if (ranges.length === 0) {
    return [];
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) {
      merged.push({ ...r });
    } else {
      last.end = Math.max(last.end, r.end);
    }
  }

  return merged;
}

/**
 * Build prompt with multiple blanks for given ranges.
 *
 * @param {string} fullText - Full sentence.
 * @param {{start:number,end:number}[]} ranges - Non-overlapping ranges, sorted.
 * @returns {string} Prompt with blanks.
 */
function buildMultiClozePrompt(fullText, ranges) {
  const safeText = String(fullText || "");
  if (!safeText) {
    return safeText;
  }
  if (!ranges || ranges.length === 0) {
    return safeText;
  }

  const parts = [];
  let cursor = 0;

  ranges.forEach((range) => {
    const startIndex = Math.max(0, Math.min(safeText.length, Number(range.start)));
    const endIndex = Math.max(startIndex, Math.min(safeText.length, Number(range.end)));

    if (startIndex > cursor) {
      parts.push(safeText.slice(cursor, startIndex));
    }

    parts.push("____");
    cursor = endIndex;
  });

  if (cursor < safeText.length) {
    parts.push(safeText.slice(cursor));
  }

  return parts.join("");
}

/**
 * SubtitlePanel
 */
export default function SubtitlePanel({
  videoId,
  videoTitle,
  videoRef,
  onSeek,
  onSubtitlesLoaded,
  playbackSettings,
  onPlaybackSettingsChange,
  onRequestNextSubtitle,
  isLexiconOpen,
  onToggleLexicon,
  activeSubtitleIndex,
  panelShape,
  onPanelShapeChange,
  isMobile,
}) {
  const [subtitles, setSubtitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  // state control highlight
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [occMap, setOccMap] = useState({});

  // "bilingual" | "de" | "zh"
  const [mode, setMode] = useState("bilingual");
  const [menuOpen, setMenuOpen] = useState(false);

  const [playMenuOpen, setPlayMenuOpen] = useState(false);

  const activePanelShape = panelShape || "normal";

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [isFillInModalOpen, setIsFillInModalOpen] = useState(false);
  const [activeExerciseKey, setActiveExerciseKey] = useState("");

  const menuRef = useRef(null);
  const mobileSheetRef = useRef(null);
  const [mobileSheet, setMobileSheet] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const isPlaybackNonDefault =
    playbackSettings?.videoMode !== "single_play" ||
    playbackSettings?.sentenceMode !== "continuous" ||
    playbackSettings?.loopCount !== 1 ||
    playbackSettings?.autoNext === true;

  const isRepeatEnabled =
    playbackSettings?.videoMode === "single_loop" ||
    playbackSettings?.sentenceMode === "loop";

  const activeItemRef = useRef(null);
  const subtitleListRef = useRef(null);

  useEffect(() => {
    let aborted = false;

    async function loadSubtitles() {
      try {
        setLoading(true);
        setErrorText("");

        const data = await fetchSubtitlesByVideo(videoId);

        if (aborted) {
          return;
        }
        setSubtitles(Array.isArray(data) ? data : []);
      } catch (err) {
        if (aborted) {
          return;
        }
        setErrorText(err?.message ? String(err.message) : "Failed to load subtitles");
        setSubtitles([]);
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    }

    if (videoId) {
      loadSubtitles();
    }

    return () => {
      aborted = true;
    };
  }, [videoId]);

  useEffect(() => {
    let aborted = false;

    async function loadOccurrences() {
      try {
        const [words, sentences, expressions] = await Promise.all([
          fetchWordOccurrences({ video: videoId }),
          fetchSentenceOccurrences({ video: videoId }),
          fetchExpressionOccurrences({ video: videoId }),
        ]);

        if (aborted) {
          return;
        }

        const nextMap = {};

        function add(subtitleId, text) {
          if (subtitleId === undefined || subtitleId === null) {
            return;
          }
          const value = String(text ?? "").trim();
          if (!value) {
            return;
          }

          const key = String(subtitleId);
          if (!nextMap[key]) {
            nextMap[key] = [];
          }
          nextMap[key].push(value);
        }

        words.forEach((o) => add(o.subtitle, o.word_text));
        sentences.forEach((o) => add(o.subtitle, o.sentence_text));
        expressions.forEach((o) => add(o.subtitle, o.expression_text));

        Object.keys(nextMap).forEach((k) => {
          nextMap[k] = Array.from(new Set(nextMap[k]));
        });

        setOccMap(nextMap);
      } catch (_err) {
        if (!aborted) {
          setOccMap({});
        }
      }
    }

    if (videoId) {
      loadOccurrences();
    }

    return () => {
      aborted = true;
    };
  }, [videoId]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuRef.current) {
        return;
      }
      if (menuRef.current.contains(e.target)) {
        return;
      }
      if (mobileSheetRef.current && mobileSheetRef.current.contains(e.target)) {
        return;
      }

      if (menuOpen) {
        setMenuOpen(false);
      }
      if (playMenuOpen) {
        setPlayMenuOpen(false);
      }
      if (mobileSheet) {
        setMobileSheet("");
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [menuOpen, playMenuOpen, mobileSheet]);

  useEffect(() => {
    const videoElement = videoRef?.current;
    if (!videoElement) {
      return;
    }

    function handlePlay() {
      setIsPlaying(true);
    }

    function handlePause() {
      setIsPlaying(false);
    }

    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("ended", handlePause);

    setIsPlaying(!videoElement.paused);

    return () => {
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("ended", handlePause);
    };
  }, [videoRef]);

  // automatic subtitle rolling
  useEffect(() => {
    const containerElement = subtitleListRef.current;
    const activeElement = activeItemRef.current;

    if (!containerElement || !activeElement) {
      return;
    }

    const containerRect = containerElement.getBoundingClientRect();
    const activeRect = activeElement.getBoundingClientRect();

    const topPadding = 8;
    const bottomPadding = 8;

    const visibleTop = containerRect.top + topPadding;
    const visibleBottom = containerRect.bottom - bottomPadding;

    const isAboveVisibleArea = activeRect.top < visibleTop;
    const isBelowVisibleArea = activeRect.bottom > visibleBottom;

    if (!isAboveVisibleArea && !isBelowVisibleArea) {
      return;
    }

    const currentScrollTop = containerElement.scrollTop;

    let nextScrollTop = currentScrollTop;

    if (isAboveVisibleArea) {
      const deltaTop = activeRect.top - containerRect.top;
      nextScrollTop = currentScrollTop + deltaTop - topPadding;
    } else if (isBelowVisibleArea) {
      const deltaBottom = activeRect.bottom - containerRect.bottom;
      nextScrollTop = currentScrollTop + deltaBottom + bottomPadding;
    }

    containerElement.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    });
  }, [activeSubtitleIndex]);

  const items = useMemo(() => {
    return subtitles.map((s) => ({
      id: s.id,
      start: Number(s.start || 0),
      end: Number(s.end || 0),
      timeLabel: formatTime(s.start),
      de: s.content || "",
      zh: s.translation || "",
    }));
  }, [subtitles]);

  useEffect(() => {
    if (!items || items.length === 0) {
      return;
    }
    if (onSubtitlesLoaded) {
      onSubtitlesLoaded(items);
    }
  }, [items, onSubtitlesLoaded]);

  function handleSelectMode(nextMode) {
    setMode(nextMode);
    setMenuOpen(false);
    setPlayMenuOpen(false);
    setMobileSheet("");
  }

  /**
   * Format seconds to SRT time format: HH:MM:SS,mmm
   *
   * @param {number} seconds - Time in seconds.
   * @returns {string} SRT timestamp.
   */
  function formatSrtTimestamp(seconds) {
    const totalMs = Math.max(0, Math.floor(Number(seconds || 0) * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )},${String(ms).padStart(3, "0")}`;
  }

  /**
   * Export subtitles as a .srt file (bilingual: German + Chinese).
   *
   * @returns {void}
   */
  function handleExportSubtitles() {
    const exportItems = items || [];
    if (!exportItems.length) {
      return;
    }

    const lines = [];

    exportItems.forEach((subtitleItem, index) => {
      const start = formatSrtTimestamp(subtitleItem.start);
      const end = formatSrtTimestamp(subtitleItem.end);

      lines.push(String(index + 1));
      lines.push(`${start} --> ${end}`);

      const german = String(subtitleItem.de || "").trim();
      const chinese = String(subtitleItem.zh || "").trim();

      if (german) {
        lines.push(german);
      }
      if (chinese) {
        lines.push(chinese);
      }

      lines.push("");
    });

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);

    const linkElement = document.createElement("a");
    linkElement.href = objectUrl;
    linkElement.download = `subtitles-${String(videoId || "video")}.srt`;
    document.body.appendChild(linkElement);
    linkElement.click();
    linkElement.remove();

    URL.revokeObjectURL(objectUrl);
  }

  /**
   * Play a single subtitle segment once (auto pause at endSeconds).
   *
   * @param {number} startSeconds - Segment start.
   * @param {number} endSeconds - Segment end.
   * @returns {void}
   */
  function playSegmentOnce(startSeconds, endSeconds) {
    const start = Number(startSeconds || 0);
    const end = Number(endSeconds || 0);

    if (onSeek) {
      onSeek(start);
    }

    const videoElement = videoRef?.current;
    if (!videoElement) {
      return;
    }

    if (typeof videoElement.currentTime === "number") {
      videoElement.currentTime = start;
    }

    const handleTimeUpdate = () => {
      const current = Number(videoRef?.current?.currentTime || 0);
      if (end > 0 && current >= end - 0.03) {
        videoRef.current.pause();
        videoRef.current.removeEventListener("timeupdate", handleTimeUpdate);
      }
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);

    const playResult = videoElement.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      });
    }
  }

  const exercisePlan = useMemo(() => {
    const plan = [];

    items.forEach((subtitleItem) => {
      const patterns = occMap[String(subtitleItem.id)] || [];
      const ranges = computeMergedRanges(subtitleItem.de, patterns);

      if (!ranges || ranges.length === 0) {
        return;
      }

      const blanks = ranges.map((range) => {
        const answerText = String(subtitleItem.de || "").slice(range.start, range.end);
        return {
          startIndex: range.start,
          endIndex: range.end,
          answerText,
        };
      });

      const promptText = buildMultiClozePrompt(subtitleItem.de, ranges);

      plan.push({
        exerciseKey: String(subtitleItem.id),
        subtitleId: subtitleItem.id,
        promptText,
        blanks,
        startSeconds: Number(subtitleItem.start || 0),
        endSeconds: Number(subtitleItem.end || 0),
        prevExerciseKey: "",
        nextExerciseKey: "",
      });
    });

    for (let i = 0; i < plan.length; i += 1) {
      plan[i].prevExerciseKey = i > 0 ? plan[i - 1].exerciseKey : "";
      plan[i].nextExerciseKey = i < plan.length - 1 ? plan[i + 1].exerciseKey : "";
    }

    return plan;
  }, [items, occMap]);

  const exerciseByKey = useMemo(() => {
    const map = {};
    exercisePlan.forEach((node) => {
      map[node.exerciseKey] = node;
    });
    return map;
  }, [exercisePlan]);

  const activeExercise = activeExerciseKey ? exerciseByKey[activeExerciseKey] : null;
  const hasNextExercise = Boolean(activeExercise?.nextExerciseKey);
  const hasPrevExercise = Boolean(activeExercise?.prevExerciseKey);

  function openExerciseModal(exerciseKey) {
    const safeKey = String(exerciseKey || "");
    if (!safeKey) {
      return;
    }

    setActiveExerciseKey(safeKey);
    setIsFillInModalOpen(true);
  }

  function goToNextExercise() {
    if (!activeExercise || !activeExercise.nextExerciseKey) {
      return;
    }

    setActiveExerciseKey(activeExercise.nextExerciseKey);
    setIsFillInModalOpen(true);
  }

  function goToPrevExercise() {
    if (!activeExercise || !activeExercise.prevExerciseKey) {
      return;
    }

    setActiveExerciseKey(activeExercise.prevExerciseKey);
    setIsFillInModalOpen(true);
  }

  function renderSubtitleText(item) {
    const showDe = mode === "bilingual" || mode === "de";
    const showZh = mode === "bilingual" || mode === "zh";
    const patterns = occMap[String(item.id)] || [];

    return (
      <>
        {showDe && item.de ? (
          <div className="vs-subDe">
            {activePanelShape === "cloze" ? (
              renderWithClozeMask({
                text: item.de,
                patterns,
                subtitleId: item.id,
                onOpenExercise: (exerciseKey) => {
                  openExerciseModal(exerciseKey);
                },
              })
            ) : (
              renderWithHighlights(item.de, patterns, highlightEnabled)
            )}
          </div>
        ) : null}

        {showZh && item.zh ? (
          <div className={mode === "zh" ? "vs-subDe" : "vs-subZh"}>
            {renderWithHighlights(item.zh, patterns, highlightEnabled)}
          </div>
        ) : null}
      </>
    );
  }

  function setPanelShapeSafe(nextShape) {
    if (onPanelShapeChange) {
      onPanelShapeChange(nextShape);
    }
  }

  function togglePanelShape(nextShape) {
    if (activePanelShape === nextShape) {
      setPanelShapeSafe("normal");
      return;
    }
    setPanelShapeSafe(nextShape);
  }

  function handleTogglePlay() {
    const videoElement = videoRef?.current;
    if (!videoElement) {
      return;
    }
    if (videoElement.paused) {
      videoElement.play();
    } else {
      videoElement.pause();
    }
  }

  const playbackRate = Number(playbackSettings?.playbackRate || 1);
  const showLoopActive = playbackSettings?.sentenceMode === "loop";

  return (
    <div className="vs-panel">
      {!isMobile ? (
        <div className="vs-panelHeader vs-subHeader">
          <div className="vs-panelTitle">动态字幕</div>

          <div className="vs-toolbar" ref={menuRef}>
            <button
              className={[
                "vs-toolBtn",
                "ui-tooltip",
                menuOpen || mode !== "bilingual" ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              data-tooltip="切换字幕显示语言"
              aria-label="Subtitle language mode"
              onClick={() => {
                setPlayMenuOpen(false);
                setMenuOpen((v) => !v);
              }}
            >
              文A
            </button>

            <button
              className={["vs-toolBtn", "ui-tooltip", isLexiconOpen ? "is-active" : ""]
                .filter(Boolean)
                .join(" ")}
              type="button"
              data-tooltip={isLexiconOpen ? "收起词典面板" : "打开词典面板"}
              aria-label="Toggle lexicon panel"
              onClick={() => {
                setMenuOpen(false);
                setPlayMenuOpen(false);

                if (onToggleLexicon) {
                  onToggleLexicon();
                }
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
              </svg>
            </button>

            <button
              className={[
                "vs-toolBtn",
                "ui-tooltip",
                activePanelShape === "shadowing" ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              data-tooltip={activePanelShape === "shadowing" ? "退出跟读练习" : "进入跟读练习"}
              aria-label="Shadowing practice"
              onClick={() => {
                setMenuOpen(false);
                setPlayMenuOpen(false);
                togglePanelShape("shadowing");
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v4" />
                <path d="M8 22h8" />
              </svg>
            </button>

            <button
              className={[
                "vs-toolBtn",
                "ui-tooltip",
                activePanelShape === "cloze" ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              data-tooltip={activePanelShape === "cloze" ? "退出填写练习" : "进入填写练习"}
              aria-label="Cloze practice"
              onClick={() => {
                setMenuOpen(false);
                setPlayMenuOpen(false);
                togglePanelShape("cloze");
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 16h8" />
                <path d="M9 9h6" />
              </svg>
            </button>

            <button
              className={[
                "vs-toolBtn",
                "ui-tooltip",
                playMenuOpen || isPlaybackNonDefault || isRepeatEnabled ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              data-tooltip="播放设置"
              aria-label="Playback settings"
              onClick={() => {
                setMenuOpen(false);
                setPlayMenuOpen((v) => !v);
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="1 4 1 10 7 10" />
                <polyline points="23 20 23 14 17 14" />
                <path d="M20.49 9A9 9 0 0 0 5.51 5.51L1 10" />
                <path d="M3.51 15A9 9 0 0 0 18.49 18.49L23 14" />
              </svg>
            </button>

            <button
              className={["vs-toolBtn", "ui-tooltip"].join(" ")}
              data-tooltip="导出字幕"
              type="button"
              aria-label="Export subtitles"
              onClick={() => {
                setMenuOpen(false);
                setPlayMenuOpen(false);
                setIsExportModalOpen(true);
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
            </button>

            {menuOpen ? (
              <div className="vs-subMenu" role="menu" aria-label="Subtitle language menu">
                <div className="vs-subMenuTitle">字幕</div>

                <button
                  className={`vs-subMenuItem ${mode === "bilingual" ? "is-active" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleSelectMode("bilingual");
                  }}
                >
                  <div className="vs-subMenuItemLeft">
                    <span className="vs-subMenuKey">文A</span>
                    <span className="vs-subMenuLabel">双语</span>
                  </div>
                  {mode === "bilingual" ? <span className="vs-subMenuCheck">✓</span> : null}
                </button>

                <button
                  className={`vs-subMenuItem ${mode === "de" ? "is-active" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleSelectMode("de");
                  }}
                >
                  <div className="vs-subMenuItemLeft">
                    <span className="vs-subMenuKey">DE</span>
                    <span className="vs-subMenuLabel">德语</span>
                  </div>
                  {mode === "de" ? <span className="vs-subMenuCheck">✓</span> : null}
                </button>

                <button
                  className={`vs-subMenuItem ${mode === "zh" ? "is-active" : ""}`}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleSelectMode("zh");
                  }}
                >
                  <div className="vs-subMenuItemLeft">
                    <span className="vs-subMenuKey">中</span>
                    <span className="vs-subMenuLabel">中文</span>
                  </div>
                  {mode === "zh" ? <span className="vs-subMenuCheck">✓</span> : null}
                </button>
              </div>
            ) : null}

            {playMenuOpen ? (
              <div className="vs-playMenu" role="menu" aria-label="Playback menu">
                <div className="vs-playMenuSectionTitle">视频</div>

                <button
                  className="vs-playMenuItem"
                  type="button"
                  onClick={() => {
                    if (onPlaybackSettingsChange) {
                      onPlaybackSettingsChange({ videoMode: "single_play" });
                    }
                  }}
                >
                  <span className="vs-playMenuItemLeft">单集播放</span>
                  {playbackSettings?.videoMode === "single_play" ? <span className="vs-playMenuCheck">✓</span> : null}
                </button>

                <button
                  className="vs-playMenuItem"
                  type="button"
                  onClick={() => {
                    if (onPlaybackSettingsChange) {
                      onPlaybackSettingsChange({ videoMode: "single_loop" });
                    }
                  }}
                >
                  <span className="vs-playMenuItemLeft">单集循环</span>
                  {playbackSettings?.videoMode === "single_loop" ? <span className="vs-playMenuCheck">✓</span> : null}
                </button>

                <div className="vs-playMenuDivider" />

                <div className="vs-playMenuSectionTitle">句子</div>

                <button
                  className="vs-playMenuItem"
                  type="button"
                  onClick={() => {
                    if (onPlaybackSettingsChange) {
                      onPlaybackSettingsChange({ sentenceMode: "continuous" });
                    }
                  }}
                >
                  <span className="vs-playMenuItemLeft">连续播放</span>
                  {playbackSettings?.sentenceMode === "continuous" ? <span className="vs-playMenuCheck">✓</span> : null}
                </button>

                <button
                  className="vs-playMenuItem"
                  type="button"
                  onClick={() => {
                    if (onPlaybackSettingsChange) {
                      onPlaybackSettingsChange({
                        sentenceMode: "loop",
                        loopCount: playbackSettings?.loopCount ?? 1,
                        autoNext: playbackSettings?.autoNext ?? false,
                      });
                    }
                  }}
                >
                  <span className="vs-playMenuItemLeft">单句循环</span>
                  {playbackSettings?.sentenceMode === "loop" ? <span className="vs-playMenuCheck">✓</span> : null}
                </button>

                {playbackSettings?.sentenceMode === "loop" ? (
                  <div className="vs-loopSettings">
                    <div className="vs-loopRow">
                      <span className="vs-loopLabel">循环次数：</span>

                      <select
                        className="vs-loopSelect"
                        value={String(playbackSettings?.loopCount ?? 1)}
                        onChange={(e) => {
                          if (onPlaybackSettingsChange) {
                            onPlaybackSettingsChange({
                              loopCount: e.target.value === "infinite" ? "infinite" : Number(e.target.value),
                            });
                          }
                        }}
                      >
                        <option value="1">1次</option>
                        <option value="2">2次</option>
                        <option value="3">3次</option>
                        <option value="4">4次</option>
                        <option value="5">5次</option>
                        <option value="infinite">无限次</option>
                      </select>
                    </div>

                    <div className="vs-loopRow">
                      <span className="vs-loopLabel">自动下句：</span>
                      <button
                        className={["vs-toggle", playbackSettings?.autoNext ? "is-on" : ""].filter(Boolean).join(" ")}
                        type="button"
                        aria-label="Toggle auto next sentence"
                        onClick={() => {
                          if (onPlaybackSettingsChange) {
                            onPlaybackSettingsChange({ autoNext: !playbackSettings?.autoNext });
                          }
                        }}
                      >
                        <span className="vs-toggleKnob" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="vs-subtitleList" ref={subtitleListRef}>
        {loading && <div className="vs-subEmpty">Loading subtitles…</div>}

        {!loading && errorText && <div className="vs-subEmpty">Failed to load subtitles: {errorText}</div>}

        {!loading && !errorText && items.length === 0 && <div className="vs-subEmpty">No subtitles available</div>}

        {!loading &&
          !errorText &&
          items.map((subtitleItem, index) => (
            <article
              ref={index === activeSubtitleIndex ? activeItemRef : null}
              key={subtitleItem.id}
              className={[
                "vs-subtitleItem",
                "vs-subtitleItem--clickable",
                index === activeSubtitleIndex ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (onSeek) {
                  onSeek(subtitleItem.start);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (onSeek) {
                    onSeek(subtitleItem.start);
                  }
                }
              }}
            >
              <div className="vs-subTime">{subtitleItem.timeLabel}</div>
              {renderSubtitleText(subtitleItem)}

              {activePanelShape === "shadowing" ? (
                <ShadowingPracticeBar
                  videoRef={videoRef}
                  videoId={videoId}
                  subtitleId={subtitleItem.id}
                  timeRange={{ start: subtitleItem.start, end: subtitleItem.end }}
                />
              ) : null}
            </article>
          ))}
      </div>

      {isMobile ? (
        <>
          <div className="vs-mobileBar">
            <button
              type="button"
              className="vs-mobileBtn"
              onClick={() => {
                setMobileSheet("mode");
              }}
            >
              <span className="vs-mobileBtnLabel">双语</span>
            </button>

            <button
              type="button"
              className="vs-mobileBtn"
              onClick={() => {
                setMobileSheet("speed");
              }}
            >
              <span className="vs-mobileBtnLabel">{Number.isFinite(playbackRate) ? `${playbackRate}x` : "1x"}</span>
            </button>

            <button
              type="button"
              className="vs-mobileMainBtn"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? "暂停" : "播放"}
            </button>

            <button
              type="button"
              className={["vs-mobileBtn", showLoopActive ? "is-active" : ""].filter(Boolean).join(" ")}
              onClick={() => {
                if (!onPlaybackSettingsChange) {
                  return;
                }
                if (playbackSettings?.sentenceMode === "loop") {
                  onPlaybackSettingsChange({ sentenceMode: "continuous" });
                } else {
                  onPlaybackSettingsChange({
                    sentenceMode: "loop",
                    loopCount: playbackSettings?.loopCount ?? 1,
                    autoNext: playbackSettings?.autoNext ?? false,
                  });
                }
              }}
            >
              <span className="vs-mobileBtnLabel">循环</span>
            </button>

            <button
              type="button"
              className={["vs-mobileBtn", activePanelShape === "cloze" ? "is-active" : ""].filter(Boolean).join(" ")}
              onClick={() => {
                togglePanelShape("cloze");
              }}
            >
              <span className="vs-mobileBtnLabel">精读</span>
            </button>

            <button
              type="button"
              className="vs-mobileMoreBtn"
              onClick={() => {
                setMobileSheet("more");
              }}
              aria-label="More settings"
            >
              ...
            </button>
          </div>

          {mobileSheet ? (
            <div
              className="vs-mobileSheetOverlay"
              onClick={() => {
                setMobileSheet("");
              }}
            >
              <div
                className="vs-mobileSheet"
                role="dialog"
                aria-modal="true"
                ref={mobileSheetRef}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <div className="vs-mobileSheetHandle" />
                {mobileSheet === "mode" ? (
                  <>
                    <div className="vs-mobileSheetTitle">字幕模式</div>
                    <div className="vs-mobileSheetList">
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          handleSelectMode("bilingual");
                        }}
                      >
                        双语
                        {mode === "bilingual" ? <span className="vs-mobileSheetCheck">✓</span> : null}
                      </button>
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          handleSelectMode("de");
                        }}
                      >
                        德语
                        {mode === "de" ? <span className="vs-mobileSheetCheck">✓</span> : null}
                      </button>
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          handleSelectMode("zh");
                        }}
                      >
                        中文
                        {mode === "zh" ? <span className="vs-mobileSheetCheck">✓</span> : null}
                      </button>
                    </div>
                  </>
                ) : null}

                {mobileSheet === "speed" ? (
                  <>
                    <div className="vs-mobileSheetTitle">播放倍速</div>
                    <div className="vs-mobileSheetList">
                      {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          className="vs-mobileSheetItem"
                          onClick={() => {
                            if (onPlaybackSettingsChange) {
                              onPlaybackSettingsChange({ playbackRate: rate });
                            }
                            setMobileSheet("");
                          }}
                        >
                          {rate}x
                          {playbackRate === rate ? <span className="vs-mobileSheetCheck">✓</span> : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {mobileSheet === "more" ? (
                  <>
                    <div className="vs-mobileSheetTitle">更多功能</div>
                    <div className="vs-mobileSheetList">
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          if (onToggleLexicon) {
                            onToggleLexicon();
                          }
                          setMobileSheet("");
                        }}
                      >
                        {isLexiconOpen ? "收起词典" : "打开词典"}
                      </button>
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          togglePanelShape("shadowing");
                          setMobileSheet("");
                        }}
                      >
                        {activePanelShape === "shadowing" ? "退出跟读" : "进入跟读"}
                      </button>
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          togglePanelShape("cloze");
                          setMobileSheet("");
                        }}
                      >
                        {activePanelShape === "cloze" ? "退出精读" : "进入精读"}
                      </button>
                      <button
                        type="button"
                        className="vs-mobileSheetItem"
                        onClick={() => {
                          setIsExportModalOpen(true);
                          setMobileSheet("");
                        }}
                      >
                        导出字幕
                      </button>
                    </div>
                  </>
                ) : null}

                <button
                  type="button"
                  className="vs-mobileSheetClose"
                  onClick={() => {
                    setMobileSheet("");
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <ExportSubtitlesModal
        isOpen={isExportModalOpen}
        videoTitle={videoTitle}
        items={items}
        onClose={() => {
          setIsExportModalOpen(false);
        }}
      />

      <FillInExerciseModal
        isOpen={isFillInModalOpen}
        exerciseKey={activeExercise?.exerciseKey || ""}
        titleText={"填写练习"}
        promptText={activeExercise?.promptText || ""}
        blanks={activeExercise?.blanks || []}
        hasPrev={hasPrevExercise}
        hasNext={hasNextExercise}
        onPlay={() => {
          if (activeExercise) {
            playSegmentOnce(activeExercise.startSeconds, activeExercise.endSeconds);
          }
        }}
        onPrev={() => {
          goToPrevExercise();
        }}
        onNext={() => {
          goToNextExercise();
        }}
        onClose={() => {
          setIsFillInModalOpen(false);
        }}
      />
    </div>
  );

  function renderSubtitleText(item) {
    const showDe = mode === "bilingual" || mode === "de";
    const showZh = mode === "bilingual" || mode === "zh";
    const patterns = occMap[String(item.id)] || [];

    return (
      <>
        {showDe && item.de ? (
          <div className="vs-subDe">
            {activePanelShape === "cloze" ? (
              renderWithClozeMask({
                text: item.de,
                patterns,
                subtitleId: item.id,
                onOpenExercise: (exerciseKey) => {
                  openExerciseModal(exerciseKey);
                },
              })
            ) : (
              renderWithHighlights(item.de, patterns, highlightEnabled)
            )}
          </div>
        ) : null}

        {showZh && item.zh ? (
          <div className={mode === "zh" ? "vs-subDe" : "vs-subZh"}>
            {renderWithHighlights(item.zh, patterns, highlightEnabled)}
          </div>
        ) : null}
      </>
    );
  }
}

/**
 * Render text with cloze masks applied to matched patterns.
 *
 * @returns {string|JSX.Element[]} Rendered content.
 */
function renderWithClozeMask({ text, patterns, subtitleId, onOpenExercise }) {
  if (!text) {
    return text;
  }

  if (!patterns || patterns.length === 0) {
    return text;
  }

  const merged = computeMergedRanges(text, patterns);
  if (merged.length === 0) {
    return text;
  }

  const parts = [];
  let cursor = 0;

  merged.forEach((m, index) => {
    if (m.start > cursor) {
      parts.push(<span key={`t-${index}-${cursor}`}>{text.slice(cursor, m.start)}</span>);
    }

    const answerText = text.slice(m.start, m.end);
    const exerciseKey = String(subtitleId);

    parts.push(
      <button
        key={`m-${index}-${m.start}`}
        type="button"
        className="vs-occ-mask"
        aria-label="Open fill-in modal"
        onClick={(event) => {
          event.stopPropagation();

          if (typeof onOpenExercise === "function") {
            onOpenExercise(exerciseKey);
          }
        }}
      >
        {answerText}
      </button>
    );

    cursor = m.end;
  });

  if (cursor < text.length) {
    parts.push(<span key={`t-end-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return parts;
}

function renderWithHighlights(text, patterns, highlightEnabled) {
  if (!highlightEnabled) {
    return text;
  }
  if (!text) {
    return text;
  }
  if (!patterns || patterns.length === 0) {
    return text;
  }

  const lower = text.toLowerCase();
  const ranges = [];

  patterns.forEach((p) => {
    const pat = String(p).trim();
    if (!pat) {
      return;
    }

    const patLower = pat.toLowerCase();
    let startIndex = 0;

    while (startIndex < lower.length) {
      const idx = lower.indexOf(patLower, startIndex);
      if (idx === -1) {
        break;
      }
      ranges.push({ start: idx, end: idx + patLower.length });
      startIndex = idx + patLower.length;
    }
  });

  if (ranges.length === 0) {
    return text;
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) {
      merged.push({ ...r });
    } else {
      last.end = Math.max(last.end, r.end);
    }
  }

  const parts = [];
  let cursor = 0;

  merged.forEach((m, i) => {
    if (m.start > cursor) {
      parts.push(<span key={`t-${i}-${cursor}`}>{text.slice(cursor, m.start)}</span>);
    }
    parts.push(
      <span key={`h-${i}-${m.start}`} className="vs-occ-hl">
        {text.slice(m.start, m.end)}
      </span>
    );
    cursor = m.end;
  });

  if (cursor < text.length) {
    parts.push(<span key={`t-end-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return parts;
}
