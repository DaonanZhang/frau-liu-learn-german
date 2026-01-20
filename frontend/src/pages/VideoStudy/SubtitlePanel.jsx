import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSubtitlesByVideo } from "../../api/learning_by_video/subtitles";
import {
  fetchWordOccurrences,
  fetchSentenceOccurrences,
  fetchExpressionOccurrences,
} from "../../api/learning_by_video/occurrences";

/**
 * Format seconds to m:ss or h:mm:ss.
 */
function formatTime(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s < 0) return "0:00";

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * SubtitlePanel
 *
 * Requirements:
 * - Fetch subtitles related to videoId
 * - Render as a fixed-height scrollable list
 * - Click subtitle to seek video to subtitle.start
 * - Provide a language mode switch:
 *   - Bilingual: translation (German) + content (Chinese)
 *   - German: translation only
 *   - Chinese: content only
 */
export default function SubtitlePanel({
  videoId,
  onSeek,
  onSubtitlesLoaded,
  playbackSettings,
  onPlaybackSettingsChange,
  onRequestNextSubtitle,
  isLexiconOpen,
  onToggleLexicon,
  activeSubtitleIndex,
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

  const menuRef = useRef(null);

  /**
   * Whether playback settings differ from the default configuration.
   *
   * Default:
   * - videoMode: "single_play"
   * - sentenceMode: "continuous"
   * - loopCount: 1
   * - autoNext: false
   *
   * @type {boolean}
   */
  const isPlaybackNonDefault =
    playbackSettings?.videoMode !== "single_play" ||
    playbackSettings?.sentenceMode !== "continuous" ||
    playbackSettings?.loopCount !== 1 ||
    playbackSettings?.autoNext === true;

  const isRepeatEnabled =
    playbackSettings?.videoMode === "single_loop" ||
    playbackSettings?.sentenceMode === "loop";

  const activeItemRef = useRef(null);

  useEffect(() => {
    let aborted = false;

    async function loadSubtitles() {
      try {
        setLoading(true);
        setErrorText("");

        const data = await fetchSubtitlesByVideo(videoId);

        if (aborted) return;
        setSubtitles(Array.isArray(data) ? data : []);
      } catch (err) {
        if (aborted) return;
        setErrorText(err?.message ? String(err.message) : "Failed to load subtitles");
        setSubtitles([]);
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    if (videoId) loadSubtitles();

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

        if (aborted) return;

        const nextMap = {};

        function add(subtitleId, text) {
          if (subtitleId === undefined || subtitleId === null) return;
          const value = String(text ?? "").trim();
          if (!value) return;

          const key = String(subtitleId);
          if (!nextMap[key]) nextMap[key] = [];
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
        if (!aborted) setOccMap({});
      }
    }

    if (videoId) loadOccurrences();

    return () => {
      aborted = true;
    };
  }, [videoId]);


  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target)) return;

      if (menuOpen) setMenuOpen(false);
      if (playMenuOpen) setPlayMenuOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [menuOpen, playMenuOpen]);


  // automatic subtitle rolling
  useEffect(() => {
    if (!activeItemRef.current) return;

    activeItemRef.current.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeSubtitleIndex]);

  /**
   * Backend fields: id, video, start, end, content, translation
   * Mapping rules:
   * - content: Chinese
   * - translation: German
   */
  const items = useMemo(() => {
    return subtitles.map((s) => ({
      id: s.id,
      start: Number(s.start || 0),
      end: Number(s.end || 0),
      timeLabel: formatTime(s.start),

      // Backend field semantics:
      // - content: German
      // - translation: Chinese
      de: s.content || "",
      zh: s.translation || "",
    }));
  }, [subtitles]);

useEffect(() => {
  if (!items || items.length === 0) return;
  onSubtitlesLoaded?.(items);
}, [items, onSubtitlesLoaded]);

  function handleSelectMode(nextMode) {
    setMode(nextMode);
    setMenuOpen(false);
    setPlayMenuOpen(false);
  }


  function renderSubtitleText(item) {
    const showDe = mode === "bilingual" || mode === "de";
    const showZh = mode === "bilingual" || mode === "zh";
    const patterns = occMap[String(item.id)] || [];

    return (
      <>
        {showDe && item.de ? (
          <div className="vs-subDe">
            {renderWithHighlights(item.de, patterns, highlightEnabled)}
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

  return (
    <div className="vs-panel">
      <div className="vs-panelHeader vs-subHeader">
        <div className="vs-panelTitle">动态字幕</div>

        <div className="vs-toolbar" ref={menuRef}>
          <button
            className={[
              "vs-toolBtn",
              (menuOpen || mode !== "bilingual") ? "is-active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-label="Subtitle language mode"
            onClick={() => {
              setPlayMenuOpen(false);
              setMenuOpen((v) => !v);
            }}
          >
            文A
          </button>


          <button
            className={["vs-toolBtn", isLexiconOpen ? "is-active" : ""].filter(Boolean).join(" ")}
            type="button"
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
              (playMenuOpen || isPlaybackNonDefault || isRepeatEnabled) ? "is-active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
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

          {menuOpen ? (
            <div className="vs-subMenu" role="menu" aria-label="Subtitle language menu">
              <div className="vs-subMenuTitle">字幕</div>

              <button
                className={`vs-subMenuItem ${mode === "bilingual" ? "is-active" : ""}`}
                type="button"
                role="menuitem"
                onClick={() => handleSelectMode("bilingual")}
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
                onClick={() => handleSelectMode("de")}
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
                onClick={() => handleSelectMode("zh")}
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
                onClick={() => onPlaybackSettingsChange?.({ videoMode: "single_play" })}
              >
                <span className="vs-playMenuItemLeft">单集播放</span>
                {playbackSettings?.videoMode === "single_play" ? <span className="vs-playMenuCheck">✓</span> : null}
              </button>

              <button
                className="vs-playMenuItem"
                type="button"
                onClick={() => onPlaybackSettingsChange?.({ videoMode: "single_loop" })}
              >
                <span className="vs-playMenuItemLeft">单集循环</span>
                {playbackSettings?.videoMode === "single_loop" ? <span className="vs-playMenuCheck">✓</span> : null}
              </button>

              <div className="vs-playMenuDivider" />

              <div className="vs-playMenuSectionTitle">句子</div>

              <button
                className="vs-playMenuItem"
                type="button"
                onClick={() => onPlaybackSettingsChange?.({ sentenceMode: "continuous" })}
              >
                <span className="vs-playMenuItemLeft">连续播放</span>
                {playbackSettings?.sentenceMode === "continuous" ? <span className="vs-playMenuCheck">✓</span> : null}
              </button>

              <button
                className="vs-playMenuItem"
                type="button"
                onClick={() =>
                  onPlaybackSettingsChange?.({
                    sentenceMode: "loop",
                    loopCount: playbackSettings?.loopCount ?? 1,
                    autoNext: playbackSettings?.autoNext ?? false,
                  })
                }
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
                      onChange={(e) =>
                        onPlaybackSettingsChange?.({ loopCount: e.target.value === "infinite" ? "infinite" : Number(e.target.value) })
                      }
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
                      onClick={() => onPlaybackSettingsChange?.({ autoNext: !playbackSettings?.autoNext })}
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

      <div className="vs-subtitleList">
        {loading && <div className="vs-subEmpty">Loading subtitles…</div>}

        {!loading && errorText && (
          <div className="vs-subEmpty">Failed to load subtitles: {errorText}</div>
        )}

        {!loading && !errorText && items.length === 0 && (
          <div className="vs-subEmpty">No subtitles available</div>
        )}

        {!loading &&
          !errorText &&
          items.map((s, index) => (
            <article
              ref={index === activeSubtitleIndex ? activeItemRef : null}
              key={s.id}
              className={[
                "vs-subtitleItem",
                "vs-subtitleItem--clickable",
                index === activeSubtitleIndex ? "is-active" : "",
              ].filter(Boolean).join(" ")}
              role="button"
              tabIndex={0}
              onClick={() => onSeek?.(s.start)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSeek?.(s.start);
                }
              }}
            >
              <div className="vs-subTime">{s.timeLabel}</div>
              {renderSubtitleText(s)}
            </article>
          ))}
      </div>
    </div>
  );
}

function renderWithHighlights(text, patterns, highlightEnabled) {
  if (!highlightEnabled) return text;
  if (!text) return text;
  if (!patterns || patterns.length === 0) return text;

  const lower = text.toLowerCase();
  const ranges = [];

  patterns.forEach((p) => {
    const pat = String(p).trim();
    if (!pat) return;

    const patLower = pat.toLowerCase();
    let startIndex = 0;

    while (startIndex < lower.length) {
      const idx = lower.indexOf(patLower, startIndex);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + patLower.length });
      startIndex = idx + patLower.length;
    }
  });

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (!last || r.start > last.end) merged.push({ ...r });
    else last.end = Math.max(last.end, r.end);
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