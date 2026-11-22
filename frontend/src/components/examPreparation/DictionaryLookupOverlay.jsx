import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { lookupDictionaryWord, setDictionaryFavorite } from "../../api/lexicon/dictionary.js";
import "./DictionaryLookupOverlay.css";

const DEFAULT_POINT_REGION_SELECTOR = "[data-dictionary-region]";
const INTERACTIVE_SELECTOR = "button,a,input,label,[role=button]";
const WORD_PATTERN = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;
const SINGLE_WORD_PATTERN = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;
const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_LIMIT = 10;
const LOOKUP_TIMEOUT = 6000;

function getTextOffset(root, node, offset) {
  if (!node || (node !== root && !root.contains(node))) return null;
  const range = root.ownerDocument.createRange();
  try {
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function getWordAtCaret(root, node, offset) {
  if (!root) return null;
  const text = root.textContent || "";
  const caretOffset = getTextOffset(root, node, offset);
  if (caretOffset === null) return null;
  WORD_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(WORD_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (caretOffset < start || caretOffset > end) continue;
    if (caretOffset === end && /[^\s\p{L}\p{M}]/u.test(text[caretOffset] || "")) return null;
    if (!/[\p{Script=Latin}]/u.test(match[0])) return null;
    return match[0];
  }
  return null;
}

function caretAtPoint(root, event) {
  const doc = root.ownerDocument;
  if (typeof doc.caretPositionFromPoint === "function") {
    const point = doc.caretPositionFromPoint(event.clientX, event.clientY);
    if (point) return point;
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY);
    if (range) return { offsetNode: range.startContainer, offset: range.startOffset };
  }
  return null;
}

function wordRect(root, word, node, offset) {
  const absoluteOffset = getTextOffset(root, node, offset);
  if (absoluteOffset === null) return root.getBoundingClientRect();
  const text = root.textContent || "";
  WORD_PATTERN.lastIndex = 0;
  const match = [...text.matchAll(WORD_PATTERN)].find((entry) => entry[0] === word
    && absoluteOffset >= entry.index && absoluteOffset <= entry.index + entry[0].length);
  if (!match) return root.getBoundingClientRect();
  let current = 0;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode;
  let startPoint;
  let endPoint;
  while ((textNode = walker.nextNode())) {
    const next = current + textNode.length;
    if (!startPoint && match.index >= current && match.index <= next) {
      startPoint = { node: textNode, offset: match.index - current };
    }
    if (!endPoint && match.index + word.length >= current && match.index + word.length <= next) {
      endPoint = { node: textNode, offset: match.index + word.length - current };
    }
    current = next;
  }
  if (!startPoint || !endPoint) return root.getBoundingClientRect();
  const range = root.ownerDocument.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range.getBoundingClientRect?.() || root.getBoundingClientRect();
}

function isDesktopHover() {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function isCoarsePointer() {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

export default function DictionaryLookupOverlay({
  collectionKey,
  lookupRequest = null,
  pointRegionSelector = DEFAULT_POINT_REGION_SELECTOR,
}) {
  const [lookup, setLookup] = useState(null);
  const [favorites, setFavorites] = useState({});
  const [favoritePending, setFavoritePending] = useState({});
  const [favoriteError, setFavoriteError] = useState({});
  const cacheRef = useRef(new Map());
  const requestRef = useRef(0);
  const timerRef = useRef(null);
  const lookupTimeoutRef = useRef(null);
  const lastWordRef = useRef("");
  const lookupTriggerRef = useRef(null);
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  const runLookup = useCallback((word, anchor) => {
    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    lookupTimeoutRef.current = null;
    const requestId = ++requestRef.current;
    const key = word.toLocaleLowerCase();
    const cacheKey = `${collectionKey || ""}:${key}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setLookup({ word, anchor, status: cached.matches.length ? "matched" : "empty", data: cached });
      return;
    }
    setLookup({ word, anchor, status: "loading", data: null });
    lookupTimeoutRef.current = setTimeout(() => {
      if (requestRef.current !== requestId) return;
      requestRef.current += 1;
      lookupTimeoutRef.current = null;
      setLookup({ word, anchor, status: "error", data: null });
    }, LOOKUP_TIMEOUT);
    lookupDictionaryWord(word, collectionKey).then((data) => {
      if (requestRef.current !== requestId) return;
      clearTimeout(lookupTimeoutRef.current);
      lookupTimeoutRef.current = null;
      cacheRef.current.set(cacheKey, data);
      setLookup({ word, anchor, status: data.matches?.length ? "matched" : "empty", data });
    }).catch(() => {
      if (requestRef.current !== requestId) return;
      clearTimeout(lookupTimeoutRef.current);
      lookupTimeoutRef.current = null;
      setLookup({ word, anchor, status: "error", data: null });
    });
  }, [collectionKey]);

  useEffect(() => {
    if (!lookupRequest) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    lookupTimeoutRef.current = null;
    requestRef.current += 1;
    lastWordRef.current = "";
    lookupTriggerRef.current = "direct";
    const word = String(lookupRequest.text || "").trim();
    const anchor = lookupRequest.anchor || { left: 0, bottom: 0 };
    if (!SINGLE_WORD_PATTERN.test(word) || !/[\p{Script=Latin}]/u.test(word)) {
      setLookup({ word, anchor, status: "empty", data: { matches: [] } });
      return;
    }
    runLookup(word, anchor);
  }, [lookupRequest, runLookup]);

  useEffect(() => {
    let longPress = null;
    let suppressClickTarget = null;
    let suppressClickTimer = null;

    const processPoint = (event, delay) => {
      if (event.target.closest?.(".dictionary-lookup-overlay")) return false;
      const root = event.target.closest?.(pointRegionSelector);
      if (!root) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        requestRef.current += 1;
        lastWordRef.current = "";
        return false;
      }
      const point = caretAtPoint(root, event);
      const word = point && getWordAtCaret(root, point.offsetNode, point.offset);
      if (!word) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        requestRef.current += 1;
        lastWordRef.current = "";
        if (delay === 0) close();
        return false;
      }
      const key = word.toLocaleLowerCase();
      const anchor = wordRect(root, word, point.offsetNode, point.offset);
      if (key === lastWordRef.current) {
        if (lookupRef.current) setLookup((current) => current ? { ...current, anchor } : current);
        return true;
      }
      lastWordRef.current = key;
      requestRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      lookupTriggerRef.current = delay > 0 ? "hover" : "direct";
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runLookup(word, anchor);
      }, delay);
      return true;
    };
    const isInteractiveRegionTarget = (target) => {
      const root = target.closest?.(pointRegionSelector);
      const interactive = target.closest?.(INTERACTIVE_SELECTOR);
      return Boolean(root && interactive
        && (root.contains(interactive) || interactive.contains(root)));
    };
    const cancelLongPress = () => {
      if (longPress?.timer) clearTimeout(longPress.timer);
      longPress = null;
    };
    const clearClickSuppression = () => {
      if (suppressClickTimer) clearTimeout(suppressClickTimer);
      suppressClickTimer = null;
      suppressClickTarget = null;
    };

    const onPointerMove = (event) => {
      if (longPress && !longPress.triggered && event.pointerId === longPress.pointerId) {
        const distanceX = event.clientX - longPress.clientX;
        const distanceY = event.clientY - longPress.clientY;
        if (distanceX * distanceX + distanceY * distanceY > LONG_PRESS_MOVE_LIMIT ** 2) {
          cancelLongPress();
        }
      }
      if (!isDesktopHover()) return;
      if (event.target.closest?.(".dictionary-lookup-overlay")) return;
      if (isInteractiveRegionTarget(event.target)) {
        processPoint(event, 300);
        return;
      }
      const isDictionaryRegion = Boolean(event.target.closest?.(pointRegionSelector));
      const hoverIsPending = !lookupRef.current || lookupRef.current.status === "loading";
      if (lookupTriggerRef.current === "hover" && (isDictionaryRegion || hoverIsPending)) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        requestRef.current += 1;
        lookupTriggerRef.current = null;
        setLookup(null);
      }
      lastWordRef.current = "";
    };
    const onClick = (event) => {
      if (event.target.closest?.(".exam-text-annotation-toolbar")) return;
      if (!isDesktopHover() || isInteractiveRegionTarget(event.target)) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      processPoint(event, 0);
    };
    const onPointerUp = (event) => {
      if (longPress && event.pointerId === longPress.pointerId) {
        const triggered = longPress.triggered;
        cancelLongPress();
        if (triggered) suppressClickTimer = setTimeout(clearClickSuppression, 1000);
      }
      if (!(event.pointerType === "touch" || isCoarsePointer())) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      if (isInteractiveRegionTarget(event.target)
        || event.target.closest?.(".exam-text-annotation-toolbar")) return;
      processPoint(event, 0);
    };
    const close = () => {
      requestRef.current += 1;
      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
      lookupTimeoutRef.current = null;
      setLookup(null);
      lastWordRef.current = "";
      lookupTriggerRef.current = null;
    };
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".dictionary-lookup-overlay")) close();
      cancelLongPress();
      const isTouch = event.pointerType === "touch"
        || (event.pointerType !== "mouse" && isCoarsePointer());
      if (!isTouch || !isInteractiveRegionTarget(event.target)) return;
      const interactive = event.target.closest(INTERACTIVE_SELECTOR);
      const pointEvent = {
        target: event.target,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      const press = {
        target: interactive,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        triggered: false,
        timer: null,
      };
      press.timer = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          cancelLongPress();
          return;
        }
        if (processPoint(pointEvent, 0)) {
          suppressClickTarget = interactive;
          press.triggered = true;
        }
        press.timer = null;
        if (!press.triggered) longPress = null;
      }, LONG_PRESS_DELAY);
      longPress = press;
    };
    const onPointerCancel = (event) => {
      if (longPress && event.pointerId === longPress.pointerId) {
        const triggered = longPress.triggered;
        cancelLongPress();
        if (triggered) clearClickSuppression();
      }
    };
    const onClickCapture = (event) => {
      if (!suppressClickTarget) return;
      const interactive = event.target.closest?.(INTERACTIVE_SELECTOR);
      if (interactive !== suppressClickTarget) return;
      clearClickSuppression();
      event.preventDefault();
      event.stopPropagation();
    };
    const onContextMenu = (event) => {
      const interactive = event.target.closest?.(INTERACTIVE_SELECTOR);
      if (interactive && (interactive === longPress?.target || interactive === suppressClickTarget)) {
        event.preventDefault();
      }
    };
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("click", onClick);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      requestRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
      lookupTimeoutRef.current = null;
      cancelLongPress();
      clearClickSuppression();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pointRegionSelector, runLookup]);

  function close() {
    requestRef.current += 1;
    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    lookupTimeoutRef.current = null;
    setLookup(null);
    lastWordRef.current = "";
    lookupTriggerRef.current = null;
  }

  async function toggleFavorite(match) {
    const matchId = match.id;
    if (favoritePending[matchId]) return;
    const card = favorites[matchId] ?? match.card;
    const nextFavorite = !card?.is_favorite;
    setFavoritePending((state) => ({ ...state, [matchId]: true }));
    setFavoriteError((state) => ({ ...state, [matchId]: false }));
    try {
      const result = await setDictionaryFavorite(matchId, nextFavorite, collectionKey);
      const nextCard = result?.card || { id: card?.id || matchId, is_favorite: nextFavorite };
      setFavorites((state) => ({ ...state, [matchId]: nextCard }));
    } catch {
      setFavoriteError((state) => ({ ...state, [matchId]: true }));
    } finally {
      setFavoritePending((state) => ({ ...state, [matchId]: false }));
    }
  }

  if (!lookup) return null;
  const matches = lookup.data?.matches || [];
  return createPortal((
    <section
      className="dictionary-lookup-overlay"
      role="dialog"
      aria-label={`词典查询：${lookup.word}`}
      style={{ "--lookup-left": `${lookup.anchor.left}px`, "--lookup-top": `${lookup.anchor.bottom + 8}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="dictionary-lookup-header">
        <strong>{lookup.word}</strong>
        <button type="button" aria-label="关闭词典查询" onClick={close}>×</button>
      </header>
      {lookup.status === "loading" && <p>查询中…</p>}
      {lookup.status === "empty" && <p>未找到释义</p>}
      {lookup.status === "error" && <p>查询失败</p>}
      {matches.length > 1 && <p className="dictionary-lookup-count">{matches.length} 个释义</p>}
      <ul>
        {matches.map((match) => {
          const card = favorites[match.id] ?? match.card;
          return (
            <li key={match.id}>
              <div className="dictionary-lookup-definition">
                <div>{match.matched_form && match.matched_form.toLocaleLowerCase() !== match.lemma?.toLocaleLowerCase()
                  ? <><span>{match.matched_form}</span> → <strong>{match.lemma}</strong></>
                  : <strong>{match.lemma}</strong>}</div>
                <div>{match.translation_zh}</div>
                {match.part_of_speech && <small>{match.part_of_speech}</small>}
              </div>
              <button
                type="button"
                disabled={Boolean(favoritePending[match.id])}
                aria-pressed={Boolean(card?.is_favorite)}
                onClick={() => toggleFavorite(match)}
              >{favoritePending[match.id] ? "处理中…" : card?.is_favorite ? "取消收藏" : "收藏"}</button>
              {favoriteError[match.id] && <small className="dictionary-lookup-error">操作失败</small>}
            </li>
          );
        })}
      </ul>
      <p className="dictionary-lookup-attribution">
        补充词条使用 <a href="https://github.com/gugray/HanDeDict" target="_blank" rel="noopener noreferrer">HanDeDict</a>
        中德词典反向生成并经严格过滤。许可：<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>。
      </p>
    </section>
  ), document.body);
}
