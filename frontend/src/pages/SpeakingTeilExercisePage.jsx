import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSpeakingTeilExerciseDetail } from "../api/exam_preparation/speakingExercises.js";
import { fetchSpeakingTurnStates, saveSpeakingTurnState } from "../api/exam_preparation/userExerciseStates.js";
import ExamActionButton from "../components/examPreparation/ExamActionButton.jsx";
import ExerciseFavoriteButton from "../components/examPreparation/ExerciseFavoriteButton.jsx";
import SpeakingPracticeRecorder from "../components/examPreparation/SpeakingPracticeRecorder.jsx";
import "./SpeakingTeilExercisePage.css";

const TITLES = { 1: "Einander kennenlernen", 2: "Über ein Thema sprechen", 3: "Gemeinsam etwas planen" };
const turnKey = (turn) => `turn:${turn.sequence}`;
const orderStateKey = (key) => key === "all" ? "dialogue-order:all" : `dialogue-order:section:${key}`;

function shuffledTurns(turns) {
  if (turns.length < 2) return [...turns];
  const next = [...turns].reverse();
  return next.every((turn, index) => turn.sequence === turns[index].sequence)
    ? [...turns.slice(1), turns[0]]
    : next;
}

function isCorrectOrder(turns, correctTurns) {
  return turns.length === correctTurns.length
    && turns.every((turn, index) => turn.sequence === correctTurns[index].sequence);
}

function restoreOrder(turns, state) {
  const turnByKey = new Map(turns.map((turn) => [turnKey(turn), turn]));
  const savedKeys = Array.isArray(state?.answer_payload?.ordered_turn_keys)
    ? state.answer_payload.ordered_turn_keys
    : [];
  return savedKeys.map((key) => turnByKey.get(key)).filter(Boolean);
}

function DialogueTurn({ turn, recorderId, showPractice = false, favoriteProps = null }) {
  const role = turn.role || "TN1";
  const roleKind = role.startsWith("Prüfer") ? "examiner" : role.toLowerCase();
  return (
    <article className={`speaking-detail-turn speaking-detail-turn--${roleKind}`}>
      <div className="speaking-detail-turn__heading">
        <span className="speaking-detail-turn__role">{role}</span>
      </div>
      <p>{turn.text}</p>
      {showPractice ? (
        <div className="speaking-detail-turn__practice">
          <SpeakingPracticeRecorder language="zh" recordingId={recorderId} />
          {favoriteProps ? <ExerciseFavoriteButton {...favoriteProps} /> : null}
        </div>
      ) : null}
    </article>
  );
}

function DialogueBuilder({ turns, value, onChange, checked, recorderPrefix, favoriteForTurn, dialogLabel = "Dialog" }) {
  const touchDragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const boardRef = useRef(null);
  const [draggedKey, setDraggedKey] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [activeDropIndex, setActiveDropIndex] = useState(null);
  const [poolDropActive, setPoolDropActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState(null);
  const shuffledPool = useMemo(() => shuffledTurns(turns), [turns]);
  const boardKeys = new Set(value.map(turnKey));
  const availableTurns = shuffledPool.filter((turn) => !boardKeys.has(turnKey(turn)));
  const tn1Pool = availableTurns.filter((turn) => String(turn.role || "TN1").toUpperCase() !== "TN2");
  const tn2Pool = availableTurns.filter((turn) => String(turn.role || "TN1").toUpperCase() === "TN2");
  const draggedTurn = turns.find((turn) => turnKey(turn) === draggedKey);
  const selectedTurn = turns.find((turn) => turnKey(turn) === selectedKey);
  const orderIsCorrect = checked && isCorrectOrder(value, turns);

  function insertTurn(key, requestedIndex) {
    const turn = turns.find((item) => turnKey(item) === key);
    if (!turn) return;
    const currentIndex = value.findIndex((item) => turnKey(item) === key);
    const next = value.filter((item) => turnKey(item) !== key);
    let insertIndex = Math.max(0, Math.min(Number(requestedIndex), value.length));
    if (currentIndex >= 0 && currentIndex < insertIndex) insertIndex -= 1;
    next.splice(Math.min(insertIndex, next.length), 0, turn);
    onChange(next);
    setSelectedKey("");
  }

  function returnToPool(key) {
    onChange(value.filter((turn) => turnKey(turn) !== key));
  }

  function move(index, delta) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= value.length) return;
    const next = [...value];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  }

  function finishDrag() {
    touchDragRef.current = null;
    setDraggedKey("");
    setActiveDropIndex(null);
    setPoolDropActive(false);
    setTouchPosition(null);
  }

  function dropIndexAtPoint(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const boardItem = target?.closest?.("[data-speaking-board-item-index]");
    if (boardItem) {
      const index = Number(boardItem.dataset.speakingBoardItemIndex);
      const rect = boardItem.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2 ? index : index + 1;
    }
    const dropZone = target?.closest?.("[data-speaking-drop-index]");
    if (dropZone) return Number(dropZone.dataset.speakingDropIndex);
    if (target?.closest?.("[data-speaking-board]")) return value.length;
    return null;
  }

  function handlePointerDown(event, key) {
    if (checked || event.pointerType === "mouse" || event.target.closest("button")) return;
    event.preventDefault();
    touchDragRef.current = {
      pointerId: event.pointerId,
      key,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      setDraggedKey(drag.key);
    }
    setTouchPosition({ x: event.clientX, y: event.clientY });
    const edgeSize = 88;
    if (event.clientY < edgeSize) window.scrollBy({ top: -18, behavior: "auto" });
    else if (event.clientY > window.innerHeight - edgeSize) window.scrollBy({ top: 18, behavior: "auto" });
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const dropIndex = dropIndexAtPoint(event.clientX, event.clientY);
    const pool = target?.closest?.("[data-speaking-pool]");
    setActiveDropIndex(dropIndex);
    setPoolDropActive(Boolean(pool));
  }

  function handlePointerUp(event, cancelled = false) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!cancelled && !drag.moved) {
      suppressClickRef.current = true;
      const turn = turns.find((item) => turnKey(item) === drag.key);
      if (turn) selectTurn(turn);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    } else if (!cancelled) {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const dropIndex = dropIndexAtPoint(event.clientX, event.clientY);
      const pool = target?.closest?.("[data-speaking-pool]");
      if (dropIndex !== null) insertTurn(drag.key, dropIndex);
      else if (pool) returnToPool(drag.key);
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    finishDrag();
  }

  function draggableProps(turn) {
    const key = turnKey(turn);
    return {
      draggable: !checked,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
        setDraggedKey(key);
      },
      onDragEnd: finishDrag,
      onPointerDown: (event) => handlePointerDown(event, key),
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: (event) => handlePointerUp(event, true),
    };
  }

  function selectTurn(turn) {
    if (checked) return;
    const key = turnKey(turn);
    setSelectedKey((current) => current === key ? "" : key);
    if (window.matchMedia("(max-width: 680px)").matches) {
      window.requestAnimationFrame(() => {
        boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function renderPool(role, poolTurns) {
    return (
      <section
        className={`speaking-dialogue-pool speaking-dialogue-pool--${role.toLowerCase()}${poolDropActive ? " is-drop-active" : ""}`}
        data-speaking-pool={role}
        onDragOver={(event) => {
          if (!checked) {
            event.preventDefault();
            setPoolDropActive(true);
          }
        }}
        onDragLeave={() => setPoolDropActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          returnToPool(event.dataTransfer.getData("text/plain"));
          finishDrag();
        }}
      >
        <h3>{role}</h3>
        <div className="speaking-dialogue-pool__cards">
          {poolTurns.map((turn) => (
            <article
              key={turnKey(turn)}
              className={`speaking-dialogue-card speaking-dialogue-card--${role.toLowerCase()}${draggedKey === turnKey(turn) ? " is-dragging" : ""}${selectedKey === turnKey(turn) ? " is-selected" : ""}`}
              {...draggableProps(turn)}
              role="button"
              tabIndex={checked ? -1 : 0}
              aria-pressed={selectedKey === turnKey(turn)}
              onClick={() => {
                if (!suppressClickRef.current) selectTurn(turn);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectTurn(turn);
                }
              }}
            >
              <span>{role}</span>
              <p>{turn.text}</p>
            </article>
          ))}
          {!poolTurns.length ? <p className="speaking-dialogue-pool__empty">已全部放入对话区</p> : null}
        </div>
      </section>
    );
  }

  function renderDropZone(index) {
    return (
      <div
        key={`drop-${index}`}
        data-speaking-drop-index={index}
        className={`speaking-dialogue-board__drop${activeDropIndex === index ? " is-active" : ""}`}
        onDragOver={(event) => {
          if (!checked) {
            event.preventDefault();
            setActiveDropIndex(index);
          }
        }}
        onDragLeave={() => setActiveDropIndex((current) => current === index ? null : current)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          insertTurn(event.dataTransfer.getData("text/plain"), index);
          finishDrag();
        }}
        onClick={() => {
          if (selectedKey && !checked) insertTurn(selectedKey, index);
        }}
      >
        <span>{selectedKey ? "点击放在这里" : value.length ? "插入这里" : "请拖拽上面的对话到此处"}</span>
      </div>
    );
  }

  return (
    <div className={`speaking-dialogue-builder${selectedKey ? " has-selected-turn" : ""}`}>
      <div className="speaking-dialogue-pools" aria-label="对话卡片池">
        {renderPool("TN1", tn1Pool)}
        {renderPool("TN2", tn2Pool)}
      </div>
      <section
        ref={boardRef}
        className={`speaking-dialogue-board${checked ? orderIsCorrect ? " is-correct" : " is-wrong" : ""}`}
        aria-label={checked ? orderIsCorrect ? "对话排序正确" : "对话排序错误" : "对话排序区"}
        data-speaking-board
        onDragOver={(event) => {
          if (checked) return;
          event.preventDefault();
          setActiveDropIndex(dropIndexAtPoint(event.clientX, event.clientY));
        }}
        onDrop={(event) => {
          if (checked) return;
          event.preventDefault();
          const index = dropIndexAtPoint(event.clientX, event.clientY);
          insertTurn(event.dataTransfer.getData("text/plain"), index ?? value.length);
          finishDrag();
        }}
      >
        {selectedTurn ? (
          <div className="speaking-dialogue-board__selected">
            <div>
              <span>{selectedTurn.role || "TN1"}</span>
              <p>{selectedTurn.text}</p>
            </div>
            <button type="button" onClick={() => setSelectedKey("")} aria-label="取消选择">×</button>
          </div>
        ) : null}
        <div className="speaking-dialogue-board__header">
          <h3>{dialogLabel}</h3>
          <span>{value.length} / {turns.length}</span>
        </div>
        <div className="speaking-dialogue-board__list">
          {renderDropZone(0)}
          {value.map((turn, index) => (
            <div key={turnKey(turn)} className="speaking-dialogue-board__item">
              <article
                className={`speaking-dialogue-card speaking-dialogue-card--${String(turn.role || "TN1").toLowerCase()} speaking-dialogue-card--placed${draggedKey === turnKey(turn) ? " is-dragging" : ""}`}
                {...draggableProps(turn)}
                data-speaking-board-item-index={index}
                onDragOver={(event) => {
                  if (checked) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setActiveDropIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
                }}
                onDrop={(event) => {
                  if (checked) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const dropIndex = event.clientY < rect.top + rect.height / 2 ? index : index + 1;
                  insertTurn(event.dataTransfer.getData("text/plain"), dropIndex);
                  finishDrag();
                }}
              >
                <div className="speaking-dialogue-card__heading">
                  <span>{turn.role || "TN1"}</span>
                  {!checked ? (
                    <div className="speaking-dialogue-card__actions">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="向上移动">↑</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === value.length - 1} aria-label="向下移动">↓</button>
                      <button type="button" onClick={() => returnToPool(turnKey(turn))} aria-label="移回卡片池">×</button>
                    </div>
                  ) : null}
                </div>
                <p>{turn.text}</p>
              </article>
              {renderDropZone(index + 1)}
            </div>
          ))}
        </div>
      </section>
      {touchPosition && draggedTurn ? (
        <div className="speaking-dialogue-drag-preview" style={{ left: touchPosition.x, top: touchPosition.y }}>
          <span>{draggedTurn.role || "TN1"}</span>
          <p>{draggedTurn.text}</p>
        </div>
      ) : null}
      {checked ? (
        <div className="speaking-detail-answer">
          <h3>Richtige Reihenfolge</h3>
          <div className="speaking-detail-dialogue">
            {turns.map((turn) => (
              <DialogueTurn key={turnKey(turn)} turn={turn} showPractice recorderId={`${recorderPrefix}-${turn.sequence}`} favoriteProps={favoriteForTurn(turn)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SpeakingTeilExercisePage({ teil }) {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState({});
  const [checked, setChecked] = useState({});
  const [activeSection, setActiveSection] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [favorites, setFavorites] = useState({});
  const [favoritePending, setFavoritePending] = useState({});

  useEffect(() => {
    let active = true;
    Promise.all([fetchSpeakingTeilExerciseDetail(exerciseId), fetchSpeakingTurnStates(exerciseId)])
      .then(([data, stateData]) => {
        if (!active) return;
        setExercise(data);
        const content = data?.content || {};
        const stateResults = stateData?.results || [];
        const statesByKey = new Map(stateResults.map((item) => [item.turn_key, item]));
        if (Number(teil) === 2) {
          const turns = Array.isArray(content.dialogue) ? content.dialogue : [];
          const state = statesByKey.get(orderStateKey("all"));
          const restored = restoreOrder(turns, state);
          setOrders({ all: restored });
          setChecked({ all: Boolean(state?.answer_payload?.is_checked) && restored.length === turns.length });
        }
        if (Number(teil) === 3) {
          const nextOrders = {};
          const nextChecked = {};
          (content.sections || []).forEach((section, index) => {
            const turns = Array.isArray(section.turns) ? section.turns : [];
            const state = statesByKey.get(orderStateKey(index));
            const restored = restoreOrder(turns, state);
            nextOrders[index] = restored;
            nextChecked[index] = Boolean(state?.answer_payload?.is_checked) && restored.length === turns.length;
          });
          setOrders(nextOrders);
          setChecked(nextChecked);
        }
        setFavorites(Object.fromEntries(
          stateResults
            .filter((item) => String(item.turn_key).startsWith("turn:"))
            .map((item) => [item.turn_key, Boolean(item.is_favorited)])
        ));
      })
      .catch((err) => { if (active) setError(err?.message || "练习加载失败。"); });
    return () => { active = false; };
  }, [exerciseId, teil]);

  const content = exercise?.content || {};
  const cards = Array.isArray(content.cards) ? content.cards : [];
  const dialogue = useMemo(() => Array.isArray(content.dialogue) ? content.dialogue : [], [content.dialogue]);
  const sections = useMemo(() => Array.isArray(content.sections) ? content.sections : [], [content.sections]);
  const topics = Array.isArray(content.topics) ? content.topics : [];
  const base = exercise?.exercise_base || {};

  async function toggleFavorite(turn) {
    const key = turnKey(turn);
    const nextValue = !favorites[key];
    setFavoritePending((previous) => ({ ...previous, [key]: true }));
    try {
      await saveSpeakingTurnState({ exercise: exercise.id, turn_key: key, is_favorited: nextValue });
      setFavorites((previous) => ({ ...previous, [key]: nextValue }));
    } catch (err) {
      setError(err?.message || "收藏保存失败。");
    } finally {
      setFavoritePending((previous) => ({ ...previous, [key]: false }));
    }
  }

  const favoriteForTurn = (turn) => ({
    isFavorited: Boolean(favorites[turnKey(turn)]),
    pending: Boolean(favoritePending[turnKey(turn)]),
    onClick: () => toggleFavorite(turn),
  });

  async function checkSection(key, turns) {
    const value = orders[key] || [];
    const isCorrect = isCorrectOrder(value, turns);
    setChecked((previous) => ({ ...previous, [key]: true }));
    try {
      await saveSpeakingTurnState({
        exercise: exercise.id,
        turn_key: orderStateKey(key),
        answer_payload: {
          ordered_turn_keys: value.map(turnKey),
          is_checked: true,
        },
        is_correct: isCorrect,
      });
    } catch (err) {
      setError(err?.message || "作答结果保存失败。");
    }
  }

  async function resetSection(key) {
    setOrders((previous) => ({ ...previous, [key]: [] }));
    setChecked((previous) => ({ ...previous, [key]: false }));
    try {
      await saveSpeakingTurnState({
        exercise: exercise.id,
        turn_key: orderStateKey(key),
        answer_payload: {
          ordered_turn_keys: [],
          is_checked: false,
        },
        is_correct: null,
      });
    } catch (err) {
      setError(err?.message || "作答状态重置失败。");
    }
  }

  if (error) return <div className="speaking-detail-state speaking-detail-state--error">{error}</div>;
  if (!exercise) return <div className="speaking-detail-state">练习加载中...</div>;
  const currentSection = sections[activeSection];

  return (
    <div className="speaking-detail-page">
      <div className="speaking-detail-topbar"><Link to={`/modules/exam-preparation/sprechen/teil-${teil}`} className="speaking-detail-back">← Zurück zu Sprechen Teil {teil}</Link></div>
      <header className="speaking-detail-hero">
        <p className="speaking-detail-hero__eyebrow">Sprechen · Teil {teil}</p>
        <div className="speaking-detail-hero__title-row"><h1>{base.title || TITLES[teil]}</h1>{base.exam_type ? <span className="speaking-detail-title-badge">{base.exam_type}</span> : null}</div>
        <div className="speaking-detail-badges"><span>{base.level || "B1"}</span>{base.is_real_exam ? <span className="speaking-detail-badge--exam">真题</span> : null}</div>
      </header>
      <section className="speaking-detail-card speaking-detail-task">
        <p className="speaking-detail-card__eyebrow">Aufgabe</p><h2>{TITLES[teil]}</h2>
        <p className="speaking-detail-task__instruction">{exercise.instruction}</p>
        {content.task ? <p className="speaking-detail-task__text">{content.task}</p> : null}
        {Number(teil) === 1 && topics.length ? <div className="speaking-detail-topic-list">{topics.map((topic) => <span key={topic}>{topic}</span>)}</div> : null}
        {Number(teil) === 2 && cards.length ? <div className="speaking-detail-opinion-grid">{cards.map((card) => <article className="speaking-detail-opinion" key={card.participant}><span>{card.participant}</span><h3>{card.title}</h3><p>{card.content}</p></article>)}</div> : null}
      </section>
      {Number(teil) === 1 ? (
        <section className="speaking-detail-card speaking-detail-example"><div className="speaking-detail-dialogue speaking-detail-dialogue--flush">{dialogue.map((turn) => <DialogueTurn key={turnKey(turn)} turn={turn} showPractice recorderId={`teil-1-${exerciseId}-${turn.sequence}`} />)}</div></section>
      ) : null}
      {Number(teil) === 2 ? (
        <section className="speaking-detail-card speaking-detail-example">
          <p className="speaking-detail-card__eyebrow">Reihenfolge</p><h2>对话排序</h2>
          <DialogueBuilder turns={dialogue} value={orders.all || []} onChange={(value) => { setOrders({ all: value }); setChecked({ all: false }); }} checked={Boolean(checked.all)} recorderPrefix={`teil-2-${exerciseId}`} favoriteForTurn={favoriteForTurn} />
          <div className="speaking-detail-actions"><ExamActionButton className="speaking-detail-check-btn" label="Prüfen" icon="check" disabled={Boolean(checked.all) || !dialogue.length || (orders.all || []).length !== dialogue.length} onClick={() => checkSection("all", dialogue)} />{checked.all ? <ExamActionButton className="speaking-detail-reset-btn" label="Wiederholen" icon="rotate" onClick={() => resetSection("all")} /> : null}</div>
        </section>
      ) : null}
      {Number(teil) === 3 && currentSection ? (
        <section className="speaking-detail-card speaking-detail-example">
          <div className="speaking-detail-carousel-header">
            <h2 className="speaking-detail-carousel-title">
              {currentSection.type}
              <span>{activeSection + 1} / {sections.length}</span>
            </h2>
            <div className="speaking-detail-carousel-nav">
              <button type="button" onClick={() => setActiveSection((current) => current - 1)} disabled={activeSection === 0}>← Zurück</button>
              <button type="button" className="speaking-detail-carousel-next" onClick={() => setActiveSection((current) => current + 1)} disabled={activeSection === sections.length - 1}>Weiter →</button>
            </div>
          </div>
          <DialogueBuilder key={activeSection} turns={currentSection.turns || []} value={orders[activeSection] || []} onChange={(value) => { setOrders((previous) => ({ ...previous, [activeSection]: value })); setChecked((previous) => ({ ...previous, [activeSection]: false })); }} checked={Boolean(checked[activeSection])} recorderPrefix={`teil-3-${exerciseId}-${activeSection}`} favoriteForTurn={favoriteForTurn} />
          <div className="speaking-detail-actions"><ExamActionButton className="speaking-detail-check-btn" label="Prüfen" icon="check" disabled={Boolean(checked[activeSection]) || !(currentSection.turns || []).length || (orders[activeSection] || []).length !== (currentSection.turns || []).length} onClick={() => checkSection(activeSection, currentSection.turns || [])} />{checked[activeSection] ? <ExamActionButton className="speaking-detail-reset-btn" label="Wiederholen" icon="rotate" onClick={() => resetSection(activeSection)} /> : null}<button type="button" className="speaking-detail-toggle-all" onClick={() => setShowAll((value) => !value)}>{showAll ? "完整对话收起" : "展示全部完整对话"}</button></div>
          {showAll ? <div className="speaking-detail-full-dialogue"><h3>Vollständiger Dialog</h3>{sections.map((section) => <section key={section.type}><h4>{section.type}</h4><div className="speaking-detail-dialogue">{(section.turns || []).map((turn) => <DialogueTurn key={turnKey(turn)} turn={turn} />)}</div></section>)}</div> : null}
        </section>
      ) : null}
    </div>
  );
}
