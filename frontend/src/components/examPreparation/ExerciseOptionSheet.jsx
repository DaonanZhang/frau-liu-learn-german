import { useEffect, useRef } from "react";
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

  return (
    <div className="exercise-option-sheet" role="dialog" aria-label={title}>
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
}
