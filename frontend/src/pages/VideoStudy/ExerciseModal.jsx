import React, { useEffect, useMemo, useState } from "react";
import "./ExerciseModal.css";
import { fetchExerciseQuestionsByVideo } from "../../api/learning_by_video/exercise_questions";

/**
 * Exercise modal for a video.
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.isOpen - Whether modal is visible.
 * @param {Function} props.onClose - Close handler.
 * @param {number|string} props.videoId - Video id for loading questions.
 * @returns {JSX.Element|null} Modal component.
 */
export default function ExerciseModal({ isOpen, onClose, videoId }) {
  const [questions, setQuestions] = useState([]);
  const [loadingState, setLoadingState] = useState("idle"); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);

  // Track selected option per question id: { [questionId]: optionId }
  const [selectedOptionByQuestionId, setSelectedOptionByQuestionId] = useState({});

  const activeQuestion = useMemo(() => {
    if (!questions.length) {
      return null;
    }
    return questions[Math.min(activeIndex, questions.length - 1)] || null;
  }, [questions, activeIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const normalizedVideoId = String(videoId ?? "").trim();
    if (!normalizedVideoId) {
      setQuestions([]);
      setLoadingState("error");
      setErrorMessage("Missing videoId.");
      return;
    }

    let isCancelled = false;

    async function loadQuestions() {
      setLoadingState("loading");
      setErrorMessage("");

      try {
        const data = await fetchExerciseQuestionsByVideo(normalizedVideoId);
        if (isCancelled) {
          return;
        }

        const normalizedList = Array.isArray(data) ? data : [];
        setQuestions(normalizedList);
        setActiveIndex(0);
        setSelectedOptionByQuestionId({});
        setLoadingState("ready");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setQuestions([]);
        setLoadingState("error");
        setErrorMessage(error?.message || "Failed to load exercise questions.");
      }
    }

    loadQuestions();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, videoId]);

  function handleSelectOption(questionId, optionId) {
    setSelectedOptionByQuestionId((prev) => {
      return {
        ...prev,
        [String(questionId)]: String(optionId),
      };
    });
  }

  function getSelectedOptionId(questionId) {
    const key = String(questionId);
    return selectedOptionByQuestionId[key] || "";
  }

  function getQuestionAnswerState(question) {
    if (!question) {
      return "";
    }

    const selectedOptionId = getSelectedOptionId(question.id);
    if (!selectedOptionId) {
      return "";
    }

    const options = Array.isArray(question.options) ? question.options : [];
    const selectedOption = options.find((option) => String(option.id) === String(selectedOptionId));

    if (!selectedOption) {
      return "";
    }

    return selectedOption.is_correct ? "correct" : "wrong";
  }

  function goPrev() {
    setActiveIndex((prev) => {
      if (prev <= 0) {
        return 0;
      }
      return prev - 1;
    });
  }

  function goNext() {
    setActiveIndex((prev) => {
      const lastIndex = Math.max(questions.length - 1, 0);
      if (prev >= lastIndex) {
        return lastIndex;
      }
      return prev + 1;
    });
  }

  function jumpToIndex(index) {
    const safeIndex = Math.max(0, Math.min(index, questions.length - 1));
    setActiveIndex(safeIndex);
  }

  function toggleOutline() {
    setIsOutlineOpen((prev) => {
      return !prev;
    });
  }

  function closeIfBackdrop(event) {
    if (!event?.target) {
      return;
    }
    if (event.target.getAttribute("data-ex-modal-backdrop") === "1") {
      onClose();
    }
  }

  function getQuestionShortLabel(question) {
    const rawPrompt = String(question?.prompt || "").trim();
    if (!rawPrompt) {
      return "??";
    }

    const words = rawPrompt.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0]} ${words[1]}`;
    }
    if (words.length === 1) {
      return words[0].slice(0, 6);
    }
    return rawPrompt.slice(0, 6);
  }


  function getOptionResultLabel(option) {
    if (!option) {
      return "";
    }
    if (option.is_correct) {
      return "Richtig ✓";
    }
    return "Falsch ✗";
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="exModalOverlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={closeIfBackdrop}
      data-ex-modal-backdrop="1"
    >
      <div className="exModalShell" data-ex-modal-backdrop="0" onMouseDown={(e) => e.stopPropagation()}>
        <header className="exModalHeader">
          <div className="exModalHeaderLeft">
            <button type="button" className="exIconButton" onClick={toggleOutline} aria-label="Toggle outline">
              {isOutlineOpen ? "⟨" : "⟩"}
            </button>
            <div className="exModalTitleWrap">
              <div className="exModalTitle">Übungen</div>
              <div className="exModalSubtitle">
                {questions.length > 0 ? `Frage ${activeIndex + 1} / ${questions.length}` : "—"}
              </div>
            </div>
          </div>

          <button type="button" className="exCloseButton" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="exModalBody">
          <aside className={`exOutline ${isOutlineOpen ? "isOpen" : "isClosed"}`}>
            <div className="exOutlineHeader">Inhalt</div>
            <div className="exOutlineList" role="list">
              {questions.map((question, index) => {
                const isActive = index === activeIndex;
                const shortLabel = getQuestionShortLabel(question);
                const answerState = getQuestionAnswerState(question);

                return (
                    <button
                      key={String(question.id)}
                      type="button"
                      className={[
                        "exOutlineItem",
                        isActive ? "isActive" : "",
                        answerState === "correct" ? "isAnsweredCorrect" : "",
                        answerState === "wrong" ? "isAnsweredWrong" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => jumpToIndex(index)}
                      role="listitem"
                    >
                    <span className="exOutlineItemIndex">{index + 1}</span>
                    <span className="exOutlineItemLabel">{shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="exMain">
            {loadingState === "loading" && (
              <div className="exStateBox">
                <div className="exStateTitle">Laden…</div>
              </div>
            )}

            {loadingState === "error" && (
              <div className="exStateBox exStateBoxError">
                <div className="exStateTitle">Fehler</div>
                <div className="exStateText">{errorMessage}</div>
              </div>
            )}

            {loadingState === "ready" && !activeQuestion && (
              <div className="exStateBox">
                <div className="exStateTitle">Keine Fragen gefunden</div>
              </div>
            )}

            {loadingState === "ready" && activeQuestion && (
              <div className="exCard">
                <div className="exQuestionMeta">
                  <span className="exBadge">{String(activeQuestion.question_type || "").replace("_", " ")}</span>
                </div>

                <h2 className="exPrompt">{activeQuestion.prompt}</h2>

                <div className="exOptions" role="list">
                  {Array.isArray(activeQuestion.options) &&
                    activeQuestion.options.map((option) => {
                      const selectedOptionId = getSelectedOptionId(activeQuestion.id);
                      const optionId = String(option.id);
                      const isSelected = selectedOptionId === optionId;
                      const showFeedback = Boolean(selectedOptionId) && isSelected;

                      return (
                        <div
                          key={optionId}
                          className={[
                            "exOptionRow",
                            isSelected ? "isSelected" : "",
                            showFeedback && option.is_correct ? "isAnsweredCorrect" : "",
                            showFeedback && !option.is_correct ? "isAnsweredWrong" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="listitem"
                        >

                          <button
                            type="button"
                            className="exOptionButton"
                            onClick={() => handleSelectOption(activeQuestion.id, optionId)}
                          >
                            <span className="exOptionText">{option.text}</span>
                          </button>

                          {showFeedback && (
                            <div className={`exFeedback ${option.is_correct ? "isCorrect" : "isWrong"}`}>
                              <div className="exFeedbackHeader">{getOptionResultLabel(option)}</div>
                              {String(option.explanation || "").trim() ? (
                                <div className="exFeedbackText">{option.explanation}</div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                <div className="exNav">
                  <button
                    type="button"
                    className="exNavButton"
                    onClick={goPrev}
                    disabled={activeIndex <= 0}
                  >
                    ← Zurück
                  </button>

                  <button
                    type="button"
                    className="exNavButton exNavButtonPrimary"
                    onClick={goNext}
                    disabled={activeIndex >= questions.length - 1}
                  >
                    Weiter →
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
