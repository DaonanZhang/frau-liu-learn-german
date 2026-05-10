import React, { useEffect, useMemo, useState } from "react";
import "./ExercisePanel.css";
import { fetchExerciseQuestionsByVideo } from "../../../api/learning_by_video/exercise_questions.js";

const EXERCISE_MODES = [
  {
    id: "listening",
    title: "听力练习",
    subtitle: "Hörverstehen",
    detail: "判断题 / 选择题",
    helper: "保持当前答题节奏，点击答案后立即看到结果。",
  },
  {
    id: "grammar",
    title: "语法 / 词汇练习",
    subtitle: "Grammatik & Wortschatz",
    detail: "空格填空",
    helper: "先选下拉答案，再点击确定查看解释。",
  },
];

function getModeMeta(modeId) {
  return EXERCISE_MODES.find((item) => item.id === modeId) || null;
}

function splitPromptByBlank(promptText) {
  return String(promptText || "").split(/_{3,}/);
}

function renderGrammarPrompt(promptText, selectedOptionText, onBlankClick, isOpen) {
  const parts = splitPromptByBlank(promptText);
  if (parts.length <= 1) {
    return <span>{String(promptText || "")}</span>;
  }

  return (
    <span className="exPanelGrammarSentence">
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;

        return (
          <React.Fragment key={`${index}-${part}`}>
            {part ? <span className="exPanelGrammarText">{part}</span> : null}
            {!isLast ? (
              <button
                type="button"
                className={[
                  "exPanelGrammarBlank",
                  selectedOptionText ? "isFilled" : "",
                  isOpen ? "isOpen" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={onBlankClick}
              >
                {selectedOptionText || ""}
              </button>
            ) : null}
          </React.Fragment>
        );
      })}
    </span>
  );
}

/**
 * Exercise panel for a video (non-modal).
 *
 * @param {Object} props - Component props.
 * @param {boolean} props.isOpen - Whether panel is visible.
 * @param {Function} props.onClose - Close handler.
 * @param {number|string} props.videoId - Video id for loading questions.
 * @param {number|string|null} props.seasonNumber - Season number for exercise mode gating.
 * @returns {JSX.Element|null} Panel component.
 */
export default function ExercisePanel({ isOpen, onClose, videoId, seasonNumber = null }) {
  const [questions, setQuestions] = useState([]);
  const [loadingState, setLoadingState] = useState("idle"); // idle | loading | ready | error
  const [errorMessage, setErrorMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [activeMode, setActiveMode] = useState("");
  const [isModePickerOpen, setIsModePickerOpen] = useState(true);
  const [openGrammarPickerQuestionId, setOpenGrammarPickerQuestionId] = useState("");

  // Track selected option per question id: { [questionId]: optionId }
  const [selectedOptionByQuestionId, setSelectedOptionByQuestionId] = useState({});
  const [confirmedQuestionIds, setConfirmedQuestionIds] = useState({});
  const normalizedSeasonNumber = Number(seasonNumber);
  const isVlogSeason = normalizedSeasonNumber === 4;
  const availableModes = useMemo(() => {
    if (isVlogSeason) {
      return EXERCISE_MODES.filter((mode) => mode.id === "grammar");
    }
    return EXERCISE_MODES;
  }, [isVlogSeason]);

  const activeQuestion = useMemo(() => {
    if (!questions.length) {
      return null;
    }
    return questions[Math.min(activeIndex, questions.length - 1)] || null;
  }, [questions, activeIndex]);

  const activeModeMeta = useMemo(() => getModeMeta(activeMode), [activeMode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (availableModes.length === 1) {
      const onlyModeId = availableModes[0]?.id || "";
      if (activeMode !== onlyModeId) {
        setActiveMode(onlyModeId);
      }
      if (isModePickerOpen) {
        setIsModePickerOpen(false);
      }
      return;
    }

    if (!availableModes.some((mode) => mode.id === activeMode)) {
      setActiveMode("");
      setIsModePickerOpen(true);
    }
  }, [activeMode, availableModes, isModePickerOpen, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeMode) {
      return;
    }

    let isCancelled = false;

    async function loadQuestions() {
      const normalizedVideoId = String(videoId ?? "").trim();
      if (!normalizedVideoId) {
        if (isCancelled) {
          return;
        }
        setQuestions([]);
        setLoadingState("error");
        setErrorMessage("Missing videoId.");
        return;
      }

      setLoadingState("loading");
      setErrorMessage("");

      try {
        const data = await fetchExerciseQuestionsByVideo(normalizedVideoId, { category: activeMode });
        if (isCancelled) {
          return;
        }

        const normalizedList = Array.isArray(data) ? data : [];
        setQuestions(normalizedList);
        setActiveIndex(0);
        setSelectedOptionByQuestionId({});
        setConfirmedQuestionIds({});
        setOpenGrammarPickerQuestionId("");
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
  }, [activeMode, isOpen, videoId]);

  function handleSelectOption(questionId, optionId) {
    const key = String(questionId);
    setSelectedOptionByQuestionId((prev) => {
      return {
        ...prev,
        [key]: String(optionId),
      };
    });

    setConfirmedQuestionIds((prev) => {
      if (!prev[key]) {
        return prev;
      }
      return {
        ...prev,
        [key]: false,
      };
    });
  }

  function getSelectedOptionId(questionId) {
    const key = String(questionId);
    return selectedOptionByQuestionId[key] || "";
  }

  function getSelectedOption(question) {
    if (!question) {
      return null;
    }

    const selectedOptionId = getSelectedOptionId(question.id);
    if (!selectedOptionId) {
      return null;
    }

    const options = Array.isArray(question.options) ? question.options : [];
    return options.find((option) => String(option.id) === String(selectedOptionId)) || null;
  }

  function isQuestionConfirmed(questionId) {
    return Boolean(confirmedQuestionIds[String(questionId)]);
  }

  function getQuestionAnswerState(question) {
    if (!question) {
      return "";
    }

    const selectedOption = getSelectedOption(question);
    if (!selectedOption) {
      return "";
    }

    if (activeMode === "grammar" && !isQuestionConfirmed(question.id)) {
      return "";
    }

    return selectedOption.is_correct ? "correct" : "wrong";
  }

  function goPrev() {
    setOpenGrammarPickerQuestionId("");
    setActiveIndex((prev) => {
      if (prev <= 0) {
        return 0;
      }
      return prev - 1;
    });
  }

  function goNext() {
    setOpenGrammarPickerQuestionId("");
    setActiveIndex((prev) => {
      const lastIndex = Math.max(questions.length - 1, 0);
      if (prev >= lastIndex) {
        return lastIndex;
      }
      return prev + 1;
    });
  }

  function jumpToIndex(index) {
    setOpenGrammarPickerQuestionId("");
    const safeIndex = Math.max(0, Math.min(index, questions.length - 1));
    setActiveIndex(safeIndex);
  }

  function toggleOutline() {
    setIsOutlineOpen((prev) => {
      return !prev;
    });
  }

  function openModePicker() {
    setIsModePickerOpen(true);
    setIsOutlineOpen(false);
  }

  function handleModeSelect(modeId) {
    setActiveMode(modeId);
    setIsModePickerOpen(false);
    setIsOutlineOpen(false);
    setQuestions([]);
    setLoadingState("idle");
    setErrorMessage("");
    setActiveIndex(0);
    setSelectedOptionByQuestionId({});
    setConfirmedQuestionIds({});
    setOpenGrammarPickerQuestionId("");
  }

  function handleConfirmAnswer(question) {
    if (!question) {
      return;
    }

    const selectedOptionId = getSelectedOptionId(question.id);
    if (!selectedOptionId) {
      return;
    }

    setConfirmedQuestionIds((prev) => ({
      ...prev,
      [String(question.id)]: true,
    }));
  }

  function toggleGrammarPicker(questionId) {
    const key = String(questionId);
    setOpenGrammarPickerQuestionId((prev) => (prev === key ? "" : key));
  }

  function getCorrectOption(question) {
    const options = Array.isArray(question?.options) ? question.options : [];
    return options.find((option) => option?.is_correct) || null;
  }

  function getGrammarExplanation(question) {
    const questionExplanation = String(question?.explanation || "").trim();
    if (questionExplanation) {
      return questionExplanation;
    }

    return String(getCorrectOption(question)?.explanation || "").trim();
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
      return words[0].slice(0, 12);
    }
    return rawPrompt.slice(0, 12);
  }

  function getOptionResultLabel(option) {
    if (!option) {
      return "";
    }
    if (option.is_correct) {
      return "✓";
    }
    return "✗";
  }

  if (!isOpen) {
    return null;
  }

  return (
    <section className="exPanel" aria-label="Exercises panel">
      <header className="exPanelHeader">
        <div className="exPanelHeaderLeft">

        <button
          type="button"
          className="exPanelIconButton"
          onClick={toggleOutline}
          aria-label={isOutlineOpen ? "Hide outline" : "Show outline"}
          title={isOutlineOpen ? "Outline schließen" : "Outline öffnen"}
        >
          ☰
        </button>


          <div className="exPanelTitleWrap">
            <div className="exPanelTitle">Übungen</div>
            <div className="exPanelSubtitle">
              {activeModeMeta
                ? `${activeModeMeta.title}${questions.length > 0 ? ` · Frage ${activeIndex + 1} / ${questions.length}` : ""}`
                : "练习模式"}
            </div>
          </div>
        </div>

        <div className="exPanelHeaderActions">
          {availableModes.length > 1 ? (
            <button type="button" className="exPanelModeButton" onClick={openModePicker}>
              切换模式
            </button>
          ) : null}
          <button type="button" className="exPanelCloseButton" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </header>

      <div className="exPanelBody">
        <aside
          className={[
            "exPanelOutline",
            isModePickerOpen || !questions.length ? "isClosed" : "",
            isOutlineOpen ? "isOpen" : "isClosed",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="exPanelOutlineHeader">Inhalt</div>

          <div className="exPanelOutlineList" role="list">
            {questions.map((question, index) => {
              const isActive = index === activeIndex;
              const shortLabel = getQuestionShortLabel(question);
              const answerState = getQuestionAnswerState(question);

              return (
                <button
                  key={String(question.id)}
                  type="button"
                  className={[
                    "exPanelOutlineItem",
                    isActive ? "isActive" : "",
                    answerState === "correct" ? "isAnsweredCorrect" : "",
                    answerState === "wrong" ? "isAnsweredWrong" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    jumpToIndex(index);
                  }}
                  role="listitem"
                >
                  <span className="exPanelOutlineItemIndex">{index + 1}</span>
                  <span className="exPanelOutlineItemLabel">{shortLabel}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="exPanelMain">
          {isModePickerOpen && (
            <section className="exPanelModeScreen" aria-label="Choose exercise mode">
              <div className="exPanelModeIntro">
                <div className="exPanelModeEyebrow">Übungen</div>
                <h2 className="exPanelModeTitle">选择练习模式</h2>
                <p className="exPanelModeText">先选择一种训练方式，再开始这一轮练习。</p>
              </div>

              <div className="exPanelModeList">
                {availableModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className="exPanelModeCard"
                    onClick={() => {
                      handleModeSelect(mode.id);
                    }}
                  >
                    <span className="exPanelModeCardTitle">{mode.title}</span>
                    <span className="exPanelModeCardSubtitle">{mode.subtitle}</span>
                    <span className="exPanelModeCardDetail">{mode.detail}</span>
                    <span className="exPanelModeCardText">{mode.helper}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!isModePickerOpen && loadingState === "loading" && (
            <div className="exPanelStateBox">
              <div className="exPanelStateTitle">Laden…</div>
            </div>
          )}

          {!isModePickerOpen && loadingState === "error" && (
            <div className="exPanelStateBox exPanelStateBoxError">
              <div className="exPanelStateTitle">Fehler</div>
              <div className="exPanelStateText">{errorMessage}</div>
            </div>
          )}

          {!isModePickerOpen && loadingState === "ready" && !activeQuestion && (
            <div className="exPanelStateBox">
              <div className="exPanelStateTitle">Keine Fragen gefunden</div>
              <div className="exPanelStateText">这个视频还没有练习哦。</div>
            </div>
          )}

          {!isModePickerOpen && loadingState === "ready" && activeQuestion && activeMode === "listening" && (
            <div className="exPanelCard">
              <div className="exPanelQuestionMeta">
                <span className="exPanelBadge">
                  {String(activeQuestion.question_type || "").replace("_", " ")}
                </span>
              </div>

              <h2 className="exPanelPrompt">{activeQuestion.prompt}</h2>

              <div className="exPanelOptions" role="list">
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
                          "exPanelOptionRow",
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
                          className="exPanelOptionButton"
                          onClick={() => {
                            handleSelectOption(activeQuestion.id, optionId);
                          }}
                        >
                          <span className="exPanelOptionText">{option.text}</span>
                        </button>

                        {showFeedback && (
                          <div className={["exPanelFeedback", option.is_correct ? "isCorrect" : "isWrong"].join(" ")}>
                            <div className="exPanelFeedbackHeader">{getOptionResultLabel(option)}</div>
                            {String(option.explanation || "").trim() ? (
                              <div className="exPanelFeedbackText">{option.explanation}</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="exPanelNav">
                <button
                  type="button"
                  className="exPanelNavButton"
                  onClick={goPrev}
                  disabled={activeIndex <= 0}
                >
                  ← Zurück
                </button>

                <button
                  type="button"
                  className="exPanelNavButton exPanelNavButtonPrimary"
                  onClick={goNext}
                  disabled={activeIndex >= questions.length - 1}
                >
                  Weiter →
                </button>
              </div>
            </div>
          )}

          {!isModePickerOpen && loadingState === "ready" && activeQuestion && activeMode === "grammar" && (
            <div className="exPanelCard exPanelCardGrammar">
              <div className="exPanelQuestionMeta">
                <span className="exPanelBadge exPanelBadgeGrammar">GRAMMAR</span>
              </div>

              <div className="exPanelGrammarLayout">
                <section className="exPanelGrammarSection exPanelGrammarSectionSentence">
                  <div className="exPanelGrammarSectionLabel">句子</div>
                  <h2 className="exPanelPrompt exPanelPromptGrammar">
                    {renderGrammarPrompt(
                      activeQuestion.prompt,
                      getSelectedOption(activeQuestion)?.text || "",
                      () => {
                        toggleGrammarPicker(activeQuestion.id);
                      },
                      openGrammarPickerQuestionId === String(activeQuestion.id)
                    )}
                  </h2>
                  {openGrammarPickerQuestionId === String(activeQuestion.id) ? (
                    <div className="exPanelGrammarDropdown" role="list">
                      {Array.isArray(activeQuestion.options)
                        ? activeQuestion.options.map((option) => {
                            const optionId = String(option.id);
                            const isSelected = getSelectedOptionId(activeQuestion.id) === optionId;

                            return (
                              <button
                                key={optionId}
                                type="button"
                                className={[
                                  "exPanelGrammarChoice",
                                  isSelected ? "isSelected" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => {
                                  handleSelectOption(activeQuestion.id, optionId);
                                }}
                                role="listitem"
                              >
                                {option.text}
                              </button>
                            );
                          })
                        : null}
                    </div>
                  ) : null}

                  <div className="exPanelGrammarActions">
                    <button
                      type="button"
                      className="exPanelGrammarButton"
                      disabled={!getSelectedOptionId(activeQuestion.id)}
                      onClick={() => {
                        handleConfirmAnswer(activeQuestion);
                      }}
                    >
                      确定
                    </button>
                  </div>

                  {isQuestionConfirmed(activeQuestion.id) && getSelectedOption(activeQuestion) ? (
                    <div
                      className={[
                        "exPanelFeedback",
                        "exPanelFeedbackGrammar",
                        getSelectedOption(activeQuestion)?.is_correct ? "isCorrect" : "isWrong",
                      ].join(" ")}
                    >
                      <div className="exPanelFeedbackHeader">
                        {getSelectedOption(activeQuestion)?.is_correct ? "✓ 回答正确" : "✗ 回答不对"}
                      </div>

                      {!getSelectedOption(activeQuestion)?.is_correct && getCorrectOption(activeQuestion) ? (
                        <div className="exPanelFeedbackText">
                          正确答案：{getCorrectOption(activeQuestion)?.text}
                        </div>
                      ) : null}

                      {getGrammarExplanation(activeQuestion) ? (
                        <div className="exPanelFeedbackText">{getGrammarExplanation(activeQuestion)}</div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>

              <div className="exPanelNav">
                <button
                  type="button"
                  className="exPanelNavButton"
                  onClick={goPrev}
                  disabled={activeIndex <= 0}
                >
                  ← Zurück
                </button>

                <button
                  type="button"
                  className="exPanelNavButton exPanelNavButtonPrimary"
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
    </section>
  );
}
