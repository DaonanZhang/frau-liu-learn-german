/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";

import {
  applyAnnotationStyle,
  clearAnnotationScope,
  clearAnnotationStyles,
  findAnnotationSegmentAtOffset,
  getAnnotationStyleState,
  getAnnotationToolbarPosition,
  loadAnnotationState,
  removeAnnotationStyle,
  saveAnnotationState,
  selectionToAnnotationRange,
  textOffsetToDomPoint,
} from "../../utils/examTextAnnotations.js";

import "./ExamTextAnnotations.css";

const EMPTY_STATE = { version: 1, regions: {} };
const AnnotationContext = createContext(null);
const INTERACTIVE_SELECTOR = "button,a,label,[role=button]";

function customHighlightsAvailable() {
  try {
    return typeof window !== "undefined"
      && typeof window.Highlight === "function"
      && window.CSS?.highlights
      && typeof window.CSS.highlights.set === "function"
      && typeof window.CSS.highlights.delete === "function";
  } catch {
    return false;
  }
}
function rangeRect(range, root) {
  if (typeof range?.getBoundingClientRect === "function") {
    return range.getBoundingClientRect();
  }
  return root?.getBoundingClientRect?.() || { left: 0, right: 0, top: 0, bottom: 0 };
}

function sameScope(left, right) {
  return left === right || (left == null && right == null);
}

function selectionSignature(selection) {
  if (!selection) return null;
  return {
    regionId: selection.regionId,
    root: selection.root,
    start: selection.start,
    end: selection.end,
  };
}

function sameSelectionSignature(left, right) {
  return Boolean(left && right)
    && left.regionId === right.regionId
    && left.root === right.root
    && left.start === right.start
    && left.end === right.end;
}

function pointerIdOf(event) {
  return Number.isFinite(event?.pointerId) ? event.pointerId : null;
}

function samePointerGesture(gesture, event) {
  if (!gesture) return false;
  const pointerId = pointerIdOf(event);
  return gesture.pointerId === null || pointerId === null || gesture.pointerId === pointerId;
}

function closestInteractive(node) {
  return node?.closest?.(INTERACTIVE_SELECTOR) || null;
}

function installHighlightStyles(providerId) {
  try {
    if (typeof document === "undefined") return null;
    const style = document.createElement("style");
    style.dataset.examTextAnnotationStyle = providerId;
    style.textContent = "::highlight(exam-text-highlight-" + providerId + "){"
      + "background: #fff1a8; color: inherit;}"
      + "::highlight(exam-text-underline-" + providerId + "){"
      + "text-decoration-line: underline; text-decoration-color: #b45309;"
      + " text-decoration-thickness: 0.12em; text-underline-offset: 0.12em;}";
    document.head?.appendChild(style);
    return style;
  } catch {
    return null;
  }
}

export function ExamTextAnnotationProvider({ scope, children }) {
  const providerId = useId().replace(/:/g, "");

  const [state, setState] = useState(() => (typeof scope === "string"
    ? loadAnnotationState(scope)
    : EMPTY_STATE));
  const stateRef = useRef(state);
  const scopeRef = useRef(scope);
  const regionsRef = useRef(new Map());
  const observersRef = useRef(new Map());

  const commitState = useCallback((nextState) => {
    stateRef.current = nextState;
    setState(nextState);
    if (typeof scopeRef.current === "string") {
      saveAnnotationState(scopeRef.current, nextState);
    }
  }, []);

  useEffect(() => {
    if (sameScope(scopeRef.current, scope)) return;
    scopeRef.current = scope;
    const nextState = typeof scope === "string" ? loadAnnotationState(scope) : EMPTY_STATE;
    commitState(nextState);
  }, [commitState, scope]);

  const rebuildHighlights = useCallback(() => {
    const regionEntries = [...regionsRef.current.entries()];
    const nextRegions = { ...stateRef.current.regions };
    let droppedStaleRanges = false;
    const highlightRanges = [];
    const underlineRanges = [];

    regionEntries.forEach(([regionId, root]) => {
      const textLength = (root.textContent || "").length;
      const sourceSegments = stateRef.current.regions[regionId] || [];
      const validSegments = [];
      sourceSegments.forEach((segment) => {
        if (!Number.isInteger(segment.start)
          || !Number.isInteger(segment.end)
          || segment.start < 0
          || segment.end <= segment.start
          || segment.end > textLength) {
          droppedStaleRanges = true;
          return;
        }
        const start = textOffsetToDomPoint(root, segment.start);
        const end = textOffsetToDomPoint(root, segment.end);
        if (!start || !end) {
          droppedStaleRanges = true;
          return;
        }
        const range = root.ownerDocument.createRange();
        try {
          range.setStart(start.node, start.offset);
          range.setEnd(end.node, end.offset);
        } catch {
          droppedStaleRanges = true;
          return;
        }
        validSegments.push(segment);
        if (segment.highlight) highlightRanges.push(range);
        if (segment.underline) underlineRanges.push(range.cloneRange());
      });
      if (validSegments.length) nextRegions[regionId] = validSegments;
      else delete nextRegions[regionId];
    });

    if (droppedStaleRanges) {
      const nextState = { version: 1, regions: nextRegions };
      commitState(nextState);
    }

    if (!customHighlightsAvailable()) return;
    const highlightKey = "exam-text-highlight-" + providerId;
    const underlineKey = "exam-text-underline-" + providerId;
    try {
      const highlights = new window.Highlight(...highlightRanges);
      const underlines = new window.Highlight(...underlineRanges);
      highlights.priority = 0;
      underlines.priority = 1;
      window.CSS.highlights.set(highlightKey, highlights);
      window.CSS.highlights.set(underlineKey, underlines);
    } catch {
      try {
        window.CSS.highlights.delete(highlightKey);
        window.CSS.highlights.delete(underlineKey);
      } catch {
        // Annotation rendering is optional and must not interrupt the page.
      }
    }
  }, [commitState, providerId]);

  const registerRegion = useCallback((regionId, root) => {
    if (!regionId || !root) return () => {};
    regionsRef.current.set(regionId, root);
    const observer = typeof MutationObserver === "function"
      ? new MutationObserver(() => rebuildHighlights())
      : null;
    observer?.observe(root, { childList: true, characterData: true, subtree: true });
    observersRef.current.set(regionId, observer);
    rebuildHighlights();
    return () => {
      if (regionsRef.current.get(regionId) === root) regionsRef.current.delete(regionId);
      const registeredObserver = observersRef.current.get(regionId);
      registeredObserver?.disconnect();
      observersRef.current.delete(regionId);
      rebuildHighlights();
    };
  }, [rebuildHighlights]);

  const clearAnnotations = useCallback(() => {
    commitState(EMPTY_STATE);
    if (typeof scopeRef.current === "string") clearAnnotationScope(scopeRef.current);
    rebuildHighlights();
  }, [commitState, rebuildHighlights]);

  const value = useMemo(() => ({
    registerRegion,
    clearAnnotations,
    commitState,
    scope,
    state,
  }), [clearAnnotations, commitState, registerRegion, scope, state]);

  useEffect(() => {
    const highlightKey = "exam-text-highlight-" + providerId;
    const underlineKey = "exam-text-underline-" + providerId;
    const canUseHighlights = customHighlightsAvailable();
    const observers = observersRef.current;
    const regions = regionsRef.current;
    const highlightStyle = canUseHighlights ? installHighlightStyles(providerId) : null;
    return () => {
      observers.forEach((observer) => observer?.disconnect());
      observers.clear();
      regions.clear();
      try {
        highlightStyle?.remove();
      } catch {
        // Best-effort style cleanup.
      }
      try {
        if (canUseHighlights && window.CSS?.highlights) {
          window.CSS.highlights.delete(highlightKey);
          window.CSS.highlights.delete(underlineKey);
        }
      } catch {
        // Best-effort registry cleanup.
      }
    };
  }, [providerId]);

  useLayoutEffect(() => {
    rebuildHighlights();
  }, [rebuildHighlights, state]);

  return (
    <AnnotationContext.Provider value={value}>
      <AnnotationController>{children}</AnnotationController>
    </AnnotationContext.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export function useExamTextAnnotations() {
  const context = useContext(AnnotationContext);
  if (!context) throw new Error("useExamTextAnnotations must be used inside ExamTextAnnotationProvider");
  return context;
}

export const AnnotatableTextRegion = forwardRef(function AnnotatableTextRegion({
  regionId,
  as: elementType = "span",
  children,
  ...props
}, forwardedRef) {
  const elementRef = useRef(null);
  const { registerRegion } = useExamTextAnnotations();

  useLayoutEffect(() => registerRegion(regionId, elementRef.current), [registerRegion, regionId, children]);
  useEffect(() => {
    if (!forwardedRef) return undefined;
    if (typeof forwardedRef === "function") {
      forwardedRef(elementRef.current);
      return () => forwardedRef(null);
    }
    forwardedRef.current = elementRef.current;
    return () => { forwardedRef.current = null; };
  }, [forwardedRef]);

  const RegionElement = elementType;
  return (
    <RegionElement
      {...props}
      ref={elementRef}
      data-exam-annotation-region={regionId}
    >
      {children}
    </RegionElement>
  );
});

function findRegisteredRegion(node, regions) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const root = element?.closest?.("[data-exam-annotation-region]");
  if (!root) return null;
  const regionId = root.dataset.examAnnotationRegion;
  return regions.get(regionId) === root ? { regionId, root } : null;
}

function getCaretPoint(event, root) {
  const doc = root.ownerDocument;
  if (typeof doc.caretPositionFromPoint === "function") {
    const point = doc.caretPositionFromPoint(event.clientX, event.clientY);
    if (point) return { node: point.offsetNode, offset: point.offset };
  }
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

function activateExistingMark(event, regions, annotationState, onActivate) {
  const region = findRegisteredRegion(event.target, regions);
  if (!region) return false;
  const point = getCaretPoint(event, region.root);
  if (!point || (point.node !== region.root && !region.root.contains(point.node))) return false;
  const range = region.root.ownerDocument.createRange();
  try {
    range.setStart(point.node, point.offset);
    range.collapse(true);
  } catch {
    return false;
  }
  const offsetRange = region.root.ownerDocument.createRange();
  try {
    offsetRange.selectNodeContents(region.root);
    offsetRange.setEnd(point.node, point.offset);
  } catch {
    return false;
  }
  const offset = offsetRange.toString().length;
  const segment = findAnnotationSegmentAtOffset(annotationState.regions[region.regionId] || [], offset)
    || findAnnotationSegmentAtOffset(annotationState.regions[region.regionId] || [], Math.max(0, offset - 1));
  if (!segment) return false;
  const start = textOffsetToDomPoint(region.root, segment.start);
  const end = textOffsetToDomPoint(region.root, segment.end);
  if (!start || !end) return false;
  const selectedRange = region.root.ownerDocument.createRange();
  selectedRange.setStart(start.node, start.offset);
  selectedRange.setEnd(end.node, end.offset);
  onActivate({
    regionId: region.regionId,
    root: region.root,
    start: segment.start,
    end: segment.end,
    text: selectedRange.toString(),
    rect: rangeRect(selectedRange, region.root),
  });
  return true;
}

function ExamTextAnnotationToolbar({ active, onAction, onDismiss }) {
  const toolbarRef = useRef(null);
  const [position, setPosition] = useState({ left: 8, top: 8, placement: "above" });

  const recalculatePosition = useCallback(() => {
    if (!active) return;
    const rect = toolbarRef.current?.getBoundingClientRect?.() || { width: 0, height: 0 };
    let selectionRect = active.rect;
    if (active.root) {
      const start = textOffsetToDomPoint(active.root, active.start);
      const end = textOffsetToDomPoint(active.root, active.end);
      if (start && end) {
        const range = active.root.ownerDocument.createRange();
        try {
          range.setStart(start.node, start.offset);
          range.setEnd(end.node, end.offset);
          selectionRect = rangeRect(range, active.root);
        } catch {
          // Keep the last known rectangle when the region is being replaced.
        }
      }
    }
    setPosition(getAnnotationToolbarPosition(
      selectionRect,
      rect,
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [active]);

  useLayoutEffect(() => {
    recalculatePosition();
  }, [recalculatePosition]);

  useEffect(() => {
    if (!active) return undefined;
    window.addEventListener("resize", recalculatePosition);
    window.addEventListener("scroll", recalculatePosition, true);
    return () => {
      window.removeEventListener("resize", recalculatePosition);
      window.removeEventListener("scroll", recalculatePosition, true);
    };
  }, [active, recalculatePosition]);

  if (!active) return null;

  const pressed = (style) => (active.styleState[style] === "mixed"
    ? "mixed"
    : active.styleState[style] === "active");

  return (
    <div
      ref={toolbarRef}
      className="exam-text-annotation-toolbar"
      data-placement={position.placement}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      role="toolbar"
      onPointerDown={(event) => {
        if (event.target.closest("button")) event.preventDefault();
      }}
      onClick={(event) => {
        const button = event.target.closest("button");
        if (button) onAction(button.dataset.annotationAction);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
      }}
    >
      <button type="button" data-annotation-action="highlight" aria-pressed={pressed("highlight")}>高亮</button>
      <button type="button" data-annotation-action="underline" aria-pressed={pressed("underline")}>下划线</button>
      <button type="button" data-annotation-action="clear" aria-pressed={false}>清除</button>
    </div>
  );
}

function AnnotationController({ children }) {
  const context = useExamTextAnnotations();
  const { state } = context;
  const [active, setActive] = useState(null);
  const activeRef = useRef(active);
  const pointerMovingRef = useRef(false);
  const pointerGestureRef = useRef(null);
  const suppressClickRef = useRef(null);
  const regionsRef = useRef(new Map());

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const supported = customHighlightsAvailable();
    if (!supported) return undefined;
    const openSelection = () => {
      if (pointerMovingRef.current) return;
      const selected = selectionToAnnotationRange(window.getSelection());
      if (!selected || regionsRef.current.get(selected.regionId) !== selected.root) {
        setActive(null);
        return;
      }
      const regionSegments = state.regions[selected.regionId] || [];
      setActive({
        ...selected,
        rect: rangeRect(window.getSelection().getRangeAt(0), selected.root),
        styleState: {
          highlight: getAnnotationStyleState(regionSegments, selected, "highlight"),
          underline: getAnnotationStyleState(regionSegments, selected, "underline"),
        },
      });
    };
    const onSelectionSignal = () => {
      const gesture = pointerGestureRef.current;
      if (pointerMovingRef.current && gesture && !gesture.selectionChanged) {
        const selected = selectionToAnnotationRange(window.getSelection());
        if (!selected || !sameSelectionSignature(gesture.selection, selectionSignature(selected))) {
          gesture.selectionChanged = true;
        }
      }
      openSelection();
    };
    const onPointerDown = (event) => {
      if (event.target.closest?.(".exam-text-annotation-toolbar")) {
        pointerMovingRef.current = false;
        pointerGestureRef.current = null;
        return;
      }
      pointerMovingRef.current = true;
      pointerGestureRef.current = {
        interactive: closestInteractive(event.target),
        pointerId: pointerIdOf(event),
        selection: selectionSignature(selectionToAnnotationRange(window.getSelection())),
        selectionChanged: false,
        dismissesSelection: !findRegisteredRegion(event.target, regionsRef.current),
      };
      suppressClickRef.current = null;
    };
    const onPointerUp = (event) => {
      pointerMovingRef.current = false;
      if (event.target.closest?.(".exam-text-annotation-toolbar")) return;
      const selected = selectionToAnnotationRange(window.getSelection());
      const gesture = pointerGestureRef.current;
      const selectionDismissed = gesture?.dismissesSelection
        && sameSelectionSignature(gesture.selection, selectionSignature(selected));
      if (!selectionDismissed) openSelection();
      const interactive = closestInteractive(event.target);
      const pointerMatches = samePointerGesture(gesture, event);
      const targetMatches = gesture && gesture.interactive && gesture.interactive === interactive;
      const rootMatches = selected && gesture?.interactive?.contains(selected.root);
      const selectionChanged = selected
        && (gesture?.selectionChanged || !sameSelectionSignature(gesture?.selection, selectionSignature(selected)));
      if (selected && pointerMatches && targetMatches && rootMatches && selectionChanged) {
        suppressClickRef.current = { target: interactive };
      } else {
        suppressClickRef.current = null;
      }
      pointerGestureRef.current = null;
      const currentSelection = window.getSelection();
      if (!selected && (!currentSelection || currentSelection.rangeCount === 0 || currentSelection.isCollapsed)) {
        activateExistingMark(event, regionsRef.current, state, (next) => {
          const regionSegments = state.regions[next.regionId] || [];
          setActive({
            ...next,
            styleState: {
              highlight: getAnnotationStyleState(regionSegments, next, "highlight"),
              underline: getAnnotationStyleState(regionSegments, next, "underline"),
            },
          });
        });
      }
    };
    const onClickCapture = (event) => {
      const suppression = suppressClickRef.current;
      if (!suppression) return;
      const interactive = closestInteractive(event.target);
      suppressClickRef.current = null;
      if (interactive === suppression.target) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setActive(null);
    };
    const onPointerOutside = (event) => {
      if (!event.target.closest?.(".exam-text-annotation-toolbar")) setActive(null);
    };
    document.addEventListener("selectionchange", onSelectionSignal);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerOutside);
    return () => {
      document.removeEventListener("selectionchange", onSelectionSignal);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerOutside);
    };
  }, [state]);

  const registerWithController = useCallback((regionId, root) => {
    regionsRef.current.set(regionId, root);
    const unregister = context.registerRegion(regionId, root);
    return () => {
      regionsRef.current.delete(regionId);
      unregister();
    };
  }, [context]);

  const handleAction = useCallback((action) => {
    const selection = activeRef.current;
    if (!selection) return;
    const segments = state.regions[selection.regionId] || [];
    let nextSegments;
    if (action === "clear") {
      nextSegments = clearAnnotationStyles(segments, selection);
    } else {
      const style = action;
      const isActive = getAnnotationStyleState(segments, selection, style) === "active";
      nextSegments = isActive
        ? removeAnnotationStyle(segments, selection, style)
        : applyAnnotationStyle(segments, selection, style);
    }
    const nextState = {
      version: 1,
      regions: { ...state.regions, [selection.regionId]: nextSegments },
    };
    context.commitState(nextState);
    setActive(null);
    window.getSelection()?.removeAllRanges();
  }, [context, state]);

  const controllerContext = useMemo(() => ({
    ...context,
    registerRegion: registerWithController,
  }), [context, registerWithController]);

  return (
    <AnnotationContext.Provider value={controllerContext}>
      {children}
      <ExamTextAnnotationToolbar
        active={active}
        onAction={handleAction}
        onDismiss={() => setActive(null)}
      />
    </AnnotationContext.Provider>
  );
}
