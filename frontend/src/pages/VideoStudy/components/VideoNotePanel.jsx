import { useEffect, useState } from "react";
import { fetchUserVideoNote, saveUserVideoNote } from "../../../api/learning_by_video/video_notes.js";
import "./VideoNotePanel.css";

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

export default function VideoNotePanel({ videoId, showTrigger = true, onOpenRequestReady }) {
  const [isOpen, setIsOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!videoId) {
      return;
    }

    let aborted = false;

    async function loadNote() {
      try {
        setLoading(true);
        setErrorText("");
        const data = await fetchUserVideoNote(videoId);
        if (aborted) {
          return;
        }
        const nextText = String(data?.note_markdown || "");
        setNoteText(nextText);
        setSavedText(nextText);
        setUpdatedAt(String(data?.updated_at || ""));
      } catch (error) {
        if (aborted) {
          return;
        }
        setErrorText(error?.data?.detail || error?.message || "加载笔记失败");
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    }

    loadNote();

    return () => {
      aborted = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!onOpenRequestReady) {
      return;
    }
    onOpenRequestReady(() => setIsOpen(true));
    return () => {
      onOpenRequestReady(null);
    };
  }, [onOpenRequestReady]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const isDirty = noteText !== savedText;

  async function handleSave() {
    if (!videoId || saving) {
      return;
    }

    try {
      setSaving(true);
      setErrorText("");
      const data = await saveUserVideoNote(videoId, noteText);
      const nextText = String(data?.note_markdown || "");
      setNoteText(nextText);
      setSavedText(nextText);
      setUpdatedAt(String(data?.updated_at || ""));
    } catch (error) {
      setErrorText(error?.data?.detail || error?.message || "保存笔记失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="vn-triggerRow">
        {showTrigger ? (
          <button
            type="button"
            className="vn-triggerBtn"
            onClick={() => setIsOpen(true)}
            disabled={loading}
          >
            {loading ? "加载笔记中..." : "打开学习笔记"}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div
          className="vn-modalOverlay"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          <section
            className="vn-modal"
            onClick={(event) => event.stopPropagation()}
            aria-label="学习笔记编辑器"
          >
            <div className="vn-header">
              <div>
                <h2 className="vn-title">学习笔记</h2>
              </div>
              <div className="vn-headerActions">
                <button
                  type="button"
                  className="vn-saveBtn"
                  disabled={!isDirty || saving || loading}
                  onClick={handleSave}
                >
                  {saving ? "保存中..." : "保存笔记"}
                </button>
                <button
                  type="button"
                  className="vn-closeBtn"
                  onClick={() => setIsOpen(false)}
                  aria-label="关闭笔记窗口"
                >
                  ✕
                </button>
              </div>
            </div>

            {updatedAt ? (
              <div className="vn-meta">上次保存：{formatUpdatedAt(updatedAt)}</div>
            ) : null}
            {errorText ? <div className="vn-error">{errorText}</div> : null}

            <div className="vn-editorCard">
              {loading ? <div className="vn-state">加载笔记中...</div> : null}
              {!loading ? (
                <textarea
                  className="vn-textarea"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="在这里记录你的学习笔记。"
                  spellCheck={false}
                />
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
