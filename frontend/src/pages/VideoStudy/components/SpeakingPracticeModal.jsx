import { useEffect, useMemo, useRef, useState } from "react";

function formatUpdatedAt(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(seconds) {
  const s = Number(seconds || 0);
  if (!Number.isFinite(s) || s < 0) {
    return "0:00";
  }

  const minutes = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export default function SpeakingPracticeModal({
  isOpen,
  onClose,
  subtitleItems,
  activeSubtitleIndex,
  onSeek,
  isMobile = false,
  noteText,
  onNoteTextChange,
  savedText,
  updatedAt,
  loading,
  saving,
  errorText,
  onSave,
}) {
  const activeItemRef = useRef(null);
  const subtitleListRef = useRef(null);
  const textareaRef = useRef(null);
  const [viewportHeight, setViewportHeight] = useState(null);
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const items = useMemo(() => {
    if (!Array.isArray(subtitleItems)) {
      return [];
    }

    return subtitleItems.map((item) => ({
      id: item.id,
      start: Number(item.start || 0),
      zh: String(item.zh || item.de || "").trim(),
      timeLabel: formatTime(item.start),
    })).filter((item) => item.zh);
  }, [subtitleItems]);

  const combinedSubtitleText = useMemo(() => {
    if (!items.length) {
      return "";
    }
    return items.map((item) => item.zh).join(" ");
  }, [items]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const container = subtitleListRef.current;
    const activeElement = activeItemRef.current;
    if (!container || !activeElement) {
      return;
    }

    const nextTop = Math.max(activeElement.offsetTop - container.clientHeight * 0.28, 0);
    container.scrollTo({ top: nextTop, behavior: "smooth" });
  }, [isOpen, activeSubtitleIndex]);

  useEffect(() => {
    if (!isOpen || !isMobile) {
      setViewportHeight(null);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      setViewportHeight(window.innerHeight || null);
      return;
    }

    const syncViewportHeight = () => {
      setViewportHeight(Math.round(viewport.height));
    };

    syncViewportHeight();
    viewport.addEventListener("resize", syncViewportHeight);
    viewport.addEventListener("scroll", syncViewportHeight);

    return () => {
      viewport.removeEventListener("resize", syncViewportHeight);
      viewport.removeEventListener("scroll", syncViewportHeight);
    };
  }, [isMobile, isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobile || !isNoteFocused) {
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const timer = window.setTimeout(() => {
      textarea.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isMobile, isNoteFocused, isOpen, viewportHeight]);

  const isDirty = noteText !== savedText;
  const keyboardInset = Math.max(
    0,
    Math.round((window.innerHeight || 0) - (viewportHeight || window.innerHeight || 0)),
  );
  const isKeyboardOpen = isMobile && keyboardInset > 120;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="vs-speakingModalOverlay" onClick={() => onClose?.()} role="presentation">
      <section
        className={[
          "vs-speakingModal",
          isKeyboardOpen ? "is-keyboardOpen" : "",
          isNoteFocused ? "is-noteFocused" : "",
        ].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="开口练习"
        onClick={(event) => event.stopPropagation()}
        style={viewportHeight ? {
          "--vs-speaking-viewport-height": `${viewportHeight}px`,
          "--vs-speaking-keyboard-inset": `${keyboardInset}px`,
        } : undefined}
      >
        <div className="vs-speakingModalHeader">
          <div>
            <h2 className="vs-speakingModalTitle">开口练习</h2>
            <p className="vs-speakingModalIntro">
              请先看上面的中文字幕，试着不用照着原句，自己组织一遍德语句子；下面把你想到的说法、不会的部分和想确认的表达记下来。
            </p>
          </div>
          <button
            type="button"
            className="vs-speakingModalCloseBtn"
            onClick={() => onClose?.()}
            aria-label="关闭开口练习"
          >
            ✕
          </button>
        </div>

        <div className={["vs-speakingModalBody", isKeyboardOpen ? "is-keyboardOpen" : ""].filter(Boolean).join(" ")}>
          <section className="vs-speakingSubtitleCard">
            <div className="vs-speakingSectionHeader">
              <div className="vs-speakingSectionTitle">中文字幕提示</div>
              {!isMobile ? (
                <div className="vs-speakingSectionMeta">点一句可以跳到对应位置</div>
              ) : null}
            </div>

            {!isMobile ? (
              <div className="vs-speakingSubtitleList" ref={subtitleListRef}>
                {items.length === 0 ? (
                  <div className="vs-speakingEmpty">当前视频还没有可用的中文字幕。</div>
                ) : (
                  items.map((item, index) => (
                    <button
                      key={item.id}
                      ref={index === activeSubtitleIndex ? activeItemRef : null}
                      type="button"
                      className={[
                        "vs-speakingSubtitleItem",
                        index === activeSubtitleIndex ? "is-active" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => onSeek?.(item.start, { resumeIfPaused: false })}
                    >
                      <span className="vs-speakingSubtitleTime">{item.timeLabel}</span>
                      <span className="vs-speakingSubtitleText">{item.zh}</span>
                    </button>
                  ))
                )}
              </div>
            ) : combinedSubtitleText ? (
              <div className="vs-speakingSubtitleBlock">{combinedSubtitleText}</div>
            ) : (
              <div className="vs-speakingEmpty">当前视频还没有可用的中文字幕。</div>
            )}
          </section>

          <section className="vs-speakingNoteCard">
            <div className="vs-speakingSectionHeader">
              <div className="vs-speakingSectionTitle">你的笔记</div>
              <div className="vs-speakingNoteActions">
                <button
                  type="button"
                  className="vs-speakingSaveBtn"
                  disabled={!isDirty || saving || loading}
                  onClick={() => {
                    onSave?.();
                  }}
                >
                  {saving ? "保存中..." : "保存笔记"}
                </button>
              </div>
            </div>

            {updatedAt ? (
              <div className="vs-speakingNoteMeta">上次保存：{formatUpdatedAt(updatedAt)}</div>
            ) : null}
            {errorText ? <div className="vs-speakingNoteError">{errorText}</div> : null}

            {loading ? (
              <div className="vs-speakingEmpty">加载笔记中...</div>
            ) : (
              <textarea
                ref={textareaRef}
                className="vs-speakingTextarea"
                value={noteText}
                onChange={(event) => onNoteTextChange?.(event.target.value)}
                onFocus={() => {
                  setIsNoteFocused(true);
                }}
                onBlur={() => {
                  setIsNoteFocused(false);
                }}
                placeholder={"试着先用自己的德语写一句。\n也可以记下不会说的地方，再回到字幕和词句里核对。"}
                spellCheck={false}
              />
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
