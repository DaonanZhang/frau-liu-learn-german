import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ExerciseOptionSheet.css";

export default function ExerciseOptionSheet({
  open,
  title,
  subtitle = "",
  options = [],
  selectedValue = "",
  onClose,
  onSelect,
}) {
  const panelRef = useRef(null);
  const anchorRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    function updatePosition() {
      const anchor = anchorRef.current?.previousElementSibling || anchorRef.current?.parentElement;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = viewportWidth <= 720 ? 8 : 16;
      const gap = viewportWidth <= 720 ? 6 : 9;
      const sheetWidth = Math.min(448, viewportWidth - margin * 2);
      const sheetHeight = panelRef.current?.getBoundingClientRect().height
        || Math.min(options.length * 80 + 28, 416, viewportHeight * 0.6);
      const spaceAbove = rect.top - margin;
      const spaceBelow = viewportHeight - rect.bottom - margin;
      const placeBelow = spaceBelow >= sheetHeight || spaceBelow >= spaceAbove;
      const preferredTop = placeBelow
        ? rect.bottom + gap
        : rect.top - sheetHeight - gap;
      const top = Math.min(
        Math.max(preferredTop, margin),
        Math.max(margin, viewportHeight - sheetHeight - margin),
      );
      const left = Math.min(
        Math.max(rect.left, margin),
        viewportWidth - sheetWidth - margin
      );
      setPosition({ top, left });
    }

    updatePosition();
    const resizeObserver = typeof ResizeObserver !== "undefined" && panelRef.current
      ? new ResizeObserver(updatePosition)
      : null;
    resizeObserver?.observe(panelRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onClose?.();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const sheet = (
    <div
      className="exercise-option-sheet"
      role="dialog"
      aria-label={title}
      aria-description={subtitle || undefined}
      style={position || undefined}
    >
      <div ref={panelRef} className="exercise-option-sheet__panel">
        <div className="exercise-option-sheet__list">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={[
                "exercise-option-sheet__option",
                option.value === selectedValue ? "exercise-option-sheet__option--selected" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                onSelect?.(option.value);
                onClose?.();
              }}
            >
              <span className="exercise-option-sheet__option-label">{option.label}</span>
              {option.meta ? (
                <span className="exercise-option-sheet__option-meta">{option.meta}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <span ref={anchorRef} className="exercise-option-sheet__anchor" aria-hidden="true" />
      {typeof document !== "undefined" ? createPortal(sheet, document.body) : null}
    </>
  );
}
