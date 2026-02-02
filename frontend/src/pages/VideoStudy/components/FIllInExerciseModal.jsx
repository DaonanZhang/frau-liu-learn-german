import React, { useEffect, useMemo, useRef, useState } from "react";
import "./FillInExerciseModal.css";

/**
 * Normalize a user input for comparison.
 *
 * @param {string} rawValue - User raw input value.
 * @returns {string} Normalized value for comparison.
 */
function normalizeInputValue(rawValue) {
  const safeValue = String(rawValue || "");
  return safeValue.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * FillInExerciseModal
 *
 * Props:
 * - isOpen: Whether the modal is visible.
 * - onClose: Close handler.
 * - promptText: The sentence/question shown in the modal.
 * - answerText: The expected answer.
 * - titleText: Optional title text.
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.isOpen - Whether modal is visible.
 * @param {Function} props.onClose - Close handler.
 * @param {string} props.promptText - Prompt text to display.
 * @param {string} props.answerText - Expected answer text.
 * @param {string=} props.titleText - Optional modal title.
 * @returns {JSX.Element|null} Modal component.
 */
export default function FillInExerciseModal({
  isOpen,
  onClose,
  promptText,
  answerText,
  titleText,
}) {
  const [userInputValue, setUserInputValue] = useState("");
  const [attemptCount, setAttemptCount] = useState(0);
  const [resultState, setResultState] = useState("idle"); // idle | correct | wrong1 | wrong2
  const [shouldShake, setShouldShake] = useState(false);

  const inputRef = useRef(null);

  const normalizedAnswer = useMemo(() => {
    return normalizeInputValue(answerText);
  }, [answerText]);

  const isLockedAsWrong = resultState === "wrong2";
  const isCorrect = resultState === "correct";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Reset modal state every time it opens.
    setUserInputValue("");
    setAttemptCount(0);
    setResultState("idle");
    setShouldShake(false);

    // Focus input on open.
    window.setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  }, [isOpen]);

  useEffect(() => {
    if (!shouldShake) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setShouldShake(false);
    }, 450);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [shouldShake]);

  /**
   * Trigger shake animation.
   *
   * @returns {void}
   */
  function triggerShake() {
    setShouldShake(false);
    window.setTimeout(() => {
      setShouldShake(true);
    }, 0);
  }

  /**
   * Check user answer and update state.
   *
   * @returns {void}
   */
  function handleCheckAnswer() {
    if (isCorrect) {
      return;
    }
    if (isLockedAsWrong) {
      return;
    }

    const normalizedUserInput = normalizeInputValue(userInputValue);

    if (!normalizedUserInput) {
      setResultState("wrong1");
      setAttemptCount((prev) => prev + 1);
      triggerShake();
      return;
    }

    if (normalizedUserInput === normalizedAnswer) {
      setResultState("correct");
      return;
    }

    setAttemptCount((prev) => {
      const nextAttemptCount = prev + 1;

      if (nextAttemptCount >= 2) {
        setResultState("wrong2");
        triggerShake();
        return nextAttemptCount;
      }

      setResultState("wrong1");
      triggerShake();
      return nextAttemptCount;
    });
  }

  /**
   * Handle overlay click (close).
   *
   * @param {React.MouseEvent} event - Click event.
   * @returns {void}
   */
  function handleOverlayClick(event) {
    if (!event.target) {
      return;
    }

    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  /**
   * Handle keydown (ESC closes).
   *
   * @param {KeyboardEvent} event - Keyboard event.
   * @returns {void}
   */
  function handleGlobalKeyDown(event) {
    if (!isOpen) {
      return;
    }

    if (event.key === "Escape") {
      onClose();
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  });

  if (!isOpen) {
    return null;
  }

  const modalStateClassName = [
    "fim-modal",
    shouldShake ? "fim-modal--shake" : "",
    resultState === "wrong1" ? "fim-modal--wrong1" : "",
    resultState === "wrong2" ? "fim-modal--wrong2" : "",
    resultState === "correct" ? "fim-modal--correct" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="fim-overlay" role="dialog" aria-modal="true" onMouseDown={handleOverlayClick}>
      <div className={modalStateClassName}>
        <div className="fim-header">
          <div className="fim-title">{titleText || "填空练习"}</div>

          <button type="button" className="fim-closeButton" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fim-body">
          <div className="fim-prompt">{promptText}</div>

          <div className="fim-inputRow">
            <input
              ref={inputRef}
              className="fim-input"
              value={userInputValue}
              onChange={(event) => {
                setUserInputValue(event.target.value);
              }}
              placeholder="在这里输入你记得的单词…"
              disabled={isCorrect}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleCheckAnswer();
                }
              }}
            />

            <button
              type="button"
              className="fim-primaryButton"
              onClick={handleCheckAnswer}
              disabled={isCorrect}
            >
              检查
            </button>
          </div>

          {resultState === "wrong1" && (
            <div className="fim-feedback fim-feedback--warn">Fast richtig</div>
          )}

          {resultState === "wrong2" && (
            <div className="fim-feedback fim-feedback--error">
              正确答案是：<span className="fim-answerReveal">{answerText}</span>
            </div>
          )}

          {resultState === "correct" && (
            <div className="fim-feedback fim-feedback--success">✅ 对了！</div>
          )}

          <div className="fim-footer">
            <button
              type="button"
              className="fim-secondaryButton"
              onClick={() => {
                setUserInputValue("");
                setAttemptCount(0);
                setResultState("idle");
                setShouldShake(false);
                if (inputRef.current) {
                  inputRef.current.focus();
                }
              }}
              disabled={isCorrect}
            >
              再试一次
            </button>

            <button type="button" className="fim-secondaryButton" onClick={onClose}>
              关闭
            </button>

            <div className="fim-attemptHint">尝试次数：{attemptCount}/2</div>
          </div>
        </div>

        {resultState === "correct" && (
          <div className="fim-confetti" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, index) => (
              <span key={index} className="fim-confettiPiece" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
