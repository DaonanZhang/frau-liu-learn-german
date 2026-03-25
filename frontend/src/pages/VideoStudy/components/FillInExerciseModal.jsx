import React, { useEffect, useMemo, useRef, useState } from "react";
import "./FillInExerciseModal.css";

/**
 * Normalize a user input for comparison.
 *
 * @param {string} rawValue - Raw input.
 * @returns {string} Normalized input.
 */
function normalizeInputValue(rawValue) {
  const safeValue = String(rawValue || "");
  return safeValue.trim().replace(/\s+/g, " ").toLowerCase();
}


function renderPromptWithInlineInputs({
  exerciseKey,
  promptText,
  blankList,
  userValues,
  setUserValues,
  inputRefs,
  isCorrect,
  isLockedAsWrong,
  isCheckDisabled,
  handleCheckAnswer,
  resultState,
}) {
  const text = String(promptText || "");
  const parts = text.split("____");

  const blankCount = Math.max(0, (parts.length - 1));
  const expectedCount = Array.isArray(blankList) ? blankList.length : 0;
  const count = Math.min(blankCount, expectedCount);

  const nodes = [];

  for (let index = 0; index < parts.length; index += 1) {
    const chunkText = parts[index];
    if (chunkText) {
      nodes.push(
        <span key={`${exerciseKey}-t-${index}`} className="fim-sentenceText">
          {chunkText}
        </span>
      );
    }

    if (index < count) {
      const answerText = String(blankList[index]?.answerText || "");
      const showReveal = resultState === "wrong2";

      nodes.push(
        <span key={`${exerciseKey}-w-${index}`} className="fim-inlineWrap">
          <input
            ref={(node) => {
              if (node) {
                inputRefs.current[index] = node;
              }
            }}
            className="fim-inlineInput"
            value={userValues[index] || ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              setUserValues((prev) => {
                const next = [...prev];
                next[index] = nextValue;
                return next;
              });
            }}
            disabled={isCorrect || isLockedAsWrong}
            inputMode="text"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (!isCheckDisabled) {
                  handleCheckAnswer();
                }
              }
            }}
          />

          {showReveal ? (
            <span className="fim-inlineAnswer" aria-label="Correct answer">
              {answerText}
            </span>
          ) : null}
        </span>
      );
    }
  }

  return <span className="fim-sentence">{nodes}</span>;
}


/**
 * FillInExerciseModal
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.isOpen - Whether modal is visible.
 * @param {() => void} props.onClose - Close handler.
 * @param {string} props.exerciseKey - Stable key; changing it resets modal state.
 * @param {string} props.promptText - Sentence with blanks.
 * @param {Array<{answerText: string}>} props.blanks - Blank definitions.
 * @param {boolean} props.hasPrev - Whether previous exercise exists.
 * @param {boolean} props.hasNext - Whether next exercise exists.
 * @param {() => void} props.onPlay - Play this sentence once.
 * @param {() => void} props.onPrev - Go to previous exercise.
 * @param {() => void} props.onNext - Go to next exercise.
 * @param {string=} props.titleText - Optional title.
 * @returns {JSX.Element|null} Modal.
 */
export default function FillInExerciseModal({
  isOpen,
  onClose,
  exerciseKey,
  promptText,
  blanks,
  hasPrev,
  hasNext,
  onPlay,
  onPrev,
  onNext,
  titleText,
}) {
  const inputRefs = useRef([]);
  const [resultState, setResultState] = useState("idle"); // idle | correct | wrong1 | wrong2
  const [shouldShake, setShouldShake] = useState(false);

  const blankList = useMemo(() => {
    return Array.isArray(blanks) ? blanks : [];
  }, [blanks]);

  const [userValues, setUserValues] = useState(() => blankList.map(() => ""));

  const normalizedAnswers = useMemo(() => {
    return blankList.map((b) => normalizeInputValue(b?.answerText));
  }, [blankList]);

  const normalizedUserValues = useMemo(() => {
    return userValues.map((v) => normalizeInputValue(v));
  }, [userValues]);

  const isLockedAsWrong = resultState === "wrong2";
  const isCorrect = resultState === "correct";

  const allFilled = normalizedUserValues.length === normalizedAnswers.length &&
    normalizedUserValues.every((v) => Boolean(v));

  const isCheckDisabled = !allFilled || isCorrect || isLockedAsWrong || normalizedAnswers.length === 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isOpen, exerciseKey]);

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
   * Reset current exercise UI state.
   *
   * @returns {void}
   */
  function resetExerciseState() {
    setResultState("idle");
    setShouldShake(false);
    setUserValues(blankList.map(() => ""));

    window.setTimeout(() => {
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    }, 0);
  }

  /**
   * Check answers and update state.
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
    if (!allFilled) {
      return;
    }

    const isAllCorrect = normalizedAnswers.every((ans, index) => {
      const userValue = normalizedUserValues[index] || "";
      return userValue === ans;
    });

    if (isAllCorrect) {
      setResultState("correct");
      return;
    }

    if (resultState === "wrong1") {
      setResultState("wrong2");
      triggerShake();
      return;
    }

    setResultState("wrong1");
    triggerShake();
  }

  /**
   * Handle overlay click.
   *
   * @param {React.MouseEvent} event - Mouse event.
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

  useEffect(() => {
    /**
     * Handle global keydown.
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

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isOpen, onClose]);

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
          <div className="fim-title">{titleText || "填写练习"}</div>

          <button type="button" className="fim-closeButton" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="fim-body">
          <div className="fim-prompt fim-prompt--big">
            {renderPromptWithInlineInputs({
              exerciseKey,
              promptText,
              blankList,
              userValues,
              setUserValues,
              inputRefs,
              isCorrect,
              isLockedAsWrong,
              isCheckDisabled,
              handleCheckAnswer,
              resultState,
            })}
          </div>

          <div className="fim-form">
            <div className="fim-checkRow">
              <button
                type="button"
                className="fim-primaryButton"
                onClick={handleCheckAnswer}
                disabled={isCheckDisabled}
              >
                检查
              </button>
            </div>
          </div>

          {resultState === "wrong1" ? (
            <div className="fim-feedback fim-feedback--warn">Fast richtig</div>
          ) : null}

          {resultState === "correct" ? (
            <div className="fim-feedback fim-feedback--success">✅ 全对了！</div>
          ) : null}

          <div className="fim-playerBar" aria-label="Exercise controls">
            <button
              type="button"
              className="fim-iconBtn"
              aria-label="Previous"
              onClick={() => {
                if (typeof onPrev === "function") {
                  onPrev();
                }
              }}
              disabled={!hasPrev}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M19 20L9 12l10-8v16Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M5 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <button
              type="button"
              className="fim-iconBtn"
              aria-label="Retry"
              onClick={() => {
                resetExerciseState();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 12a9 9 0 1 1-2.64-6.36"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M21 3v6h-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className="fim-iconBtn fim-iconBtn--primary"
              aria-label="Play"
              onClick={() => {
                if (typeof onPlay === "function") {
                  onPlay();
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 5v14l11-7L8 5Z" fill="currentColor" />
              </svg>
            </button>

            <button
              type="button"
              className="fim-iconBtn"
              aria-label="Next"
              onClick={() => {
                if (typeof onNext === "function") {
                  onNext();
                }
              }}
              disabled={!hasNext}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 4l10 8-10 8V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M19 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {resultState === "correct" ? (
          <div className="fim-confetti" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, index) => (
              <span key={index} className="fim-confettiPiece" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
