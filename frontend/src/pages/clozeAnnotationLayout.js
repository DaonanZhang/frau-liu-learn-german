import { useLayoutEffect, useRef, useState } from "react";

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function layoutClozeAnnotations({
  containerLeft,
  containerRight,
  annotations,
  rowTolerance = 4,
  laneGap = 8,
}) {
  const left = Number.isFinite(containerLeft) ? containerLeft : 0;
  const right = Number.isFinite(containerRight) ? Math.max(containerRight, left) : left;
  const availableWidth = right - left;
  const rows = [];
  const sortedAnnotations = (annotations || [])
    .map((annotation, index) => ({
      ...annotation,
      _index: index,
      anchor: Number.isFinite(annotation.anchor) ? annotation.anchor : left,
      top: Number.isFinite(annotation.top) ? annotation.top : 0,
      anchorBottom: Number.isFinite(annotation.anchorBottom)
        ? Math.max(annotation.anchorBottom, annotation.top)
        : (Number.isFinite(annotation.top) ? annotation.top : 0),
      width: clamp(
        Number.isFinite(annotation.preferredWidth) ? Math.max(annotation.preferredWidth, 0) : 0,
        0,
        availableWidth
      ),
      height: Number.isFinite(annotation.height) ? Math.max(annotation.height, 0) : 0,
    }))
    .sort((first, second) => first.top - second.top || first.anchor - second.anchor || first._index - second._index);

  sortedAnnotations.forEach((annotation) => {
    let row = rows[rows.length - 1];
    if (!row || annotation.top > row.bottom + rowTolerance) {
      row = { top: annotation.top, bottom: annotation.anchorBottom, entries: [], lanes: [] };
      rows.push(row);
    }
    row.bottom = Math.max(row.bottom, annotation.anchorBottom);

    const x = clamp(annotation.anchor, left, Math.max(left, right - annotation.width));
    let lane = 0;
    while (row.lanes[lane]?.some((entry) => x < entry.end && x + annotation.width > entry.start)) {
      lane += 1;
    }
    if (!row.lanes[lane]) {
      row.lanes[lane] = [];
    }
    const entry = {
      annotation,
      x,
      lane,
      start: x,
      end: x + annotation.width,
    };
    row.lanes[lane].push(entry);
    row.entries.push(entry);
  });

  const result = [];
  const rowResults = rows.map((row) => {
    const laneHeights = row.lanes.map((lane) => Math.max(...lane.map((entry) => entry.annotation.height), 0));
    const lineHeight = laneHeights.reduce((total, height) => total + height, 0)
      + Math.max(0, laneHeights.length - 1) * laneGap;
    let laneOffset = 0;
    row.lanes.forEach((lane, laneIndex) => {
      lane.forEach((entry) => {
        result[entry.annotation._index] = {
          ...entry.annotation,
          x: entry.x,
          width: entry.annotation.width,
          lane: entry.lane,
          laneOffset,
          lineHeight,
          reserveHeight: entry === row.entries[0] ? lineHeight : 0,
        };
      });
      laneOffset += laneHeights[laneIndex] + laneGap;
    });
    return {
      top: row.top,
      lineHeight,
      laneCount: row.lanes.length,
    };
  });

  return { annotations: result, rows: rowResults };
}

export function useClozeAnnotationLayout({ blanks, isChecked, paragraphs }) {
  const [annotationLayout, setAnnotationLayout] = useState({});
  const clozeTextRef = useRef(null);
  const blankRefs = useRef({});
  const detailsRefs = useRef({});

  useLayoutEffect(() => {
    if (!isChecked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnotationLayout((previous) => Object.keys(previous).length ? {} : previous);
      return undefined;
    }

    const textElement = clozeTextRef.current;
    if (!textElement) {
      return undefined;
    }

    function measureAnnotations() {
      const textRect = textElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || textRect.right;
      const containerLeft = Math.max(textRect.left, 8);
      const containerRight = Math.min(textRect.right, viewportWidth - 8);
      const measurements = (blanks || []).map((blank) => {
        const blankElement = blankRefs.current[blank.blank_key];
        const annotationElement = blankElement
          ? blankElement.querySelector(".cloze-blank-inline__annotation")
          : null;
        const detailsElement = detailsRefs.current[blank.blank_key];
        const slotElement = blankElement?.querySelector(".cloze-drop-slot");
        if (!blankElement || !annotationElement || !detailsElement || !slotElement) {
          return null;
        }
        const slotRect = slotElement.getBoundingClientRect();
        const annotationRect = annotationElement.getBoundingClientRect();
        const detailsRect = detailsElement.getBoundingClientRect();
        return {
          id: blank.blank_key,
          anchor: slotRect.left,
          top: slotRect.top,
          anchorBottom: slotRect.bottom,
          preferredWidth: Math.max(detailsElement.scrollWidth || 0, detailsRect.width),
          height: Math.max(detailsRect.height, detailsElement.scrollHeight || 0),
          annotationLeft: annotationRect.left,
        };
      }).filter(Boolean);

      const layout = layoutClozeAnnotations({
        containerLeft,
        containerRight,
        annotations: measurements,
      });
      const nextLayout = Object.fromEntries(layout.annotations.map((annotation) => {
        const measurement = measurements.find((item) => item.id === annotation.id);
        return [annotation.id, {
          ...annotation,
          xOffset: annotation.x - measurement.annotationLeft,
        }];
      }));
      setAnnotationLayout((previous) => {
        const previousKeys = Object.keys(previous);
        const nextKeys = Object.keys(nextLayout);
        const unchanged = previousKeys.length === nextKeys.length
          && nextKeys.every((key) => {
            const previousItem = previous[key];
            const nextItem = nextLayout[key];
            return previousItem
              && previousItem.xOffset === nextItem.xOffset
              && previousItem.width === nextItem.width
              && previousItem.laneOffset === nextItem.laneOffset
              && previousItem.reserveHeight === nextItem.reserveHeight;
          });
        return unchanged ? previous : nextLayout;
      });
    }

    measureAnnotations();
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measureAnnotations)
      : null;
    resizeObserver?.observe(textElement);
    Object.values(detailsRefs.current).filter(Boolean).forEach((element) => {
      resizeObserver?.observe(element);
    });
    window.addEventListener("resize", measureAnnotations);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureAnnotations);
    };
  }, [blanks, isChecked, paragraphs]);

  return {
    annotationLayout: isChecked ? annotationLayout : {},
    clozeTextRef,
    blankRefs,
    detailsRefs,
  };
}
