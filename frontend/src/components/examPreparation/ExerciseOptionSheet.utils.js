const DEFAULT_SHEET_WIDTH = 18 * 16;

export function getExerciseOptionSheetWidth(options, {
  metaPlacement = "after",
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024,
  margin = viewportWidth <= 720 ? 8 : 16,
} = {}) {
  const longestOptionWidth = (options || []).reduce((maxWidth, option) => {
    const label = String(option?.label || "");
    const estimatedTextWidth = [...label].reduce(
      (width, character) => width + (character.charCodeAt(0) > 255 ? 16 : 8.5),
      0,
    );
    const metaWidth = metaPlacement === "before" && option?.meta ? 2 * 16 + 0.75 * 16 : 0;
    return Math.max(maxWidth, estimatedTextWidth + 2 * 16 + metaWidth);
  }, 0);

  return Math.min(
    Math.max(DEFAULT_SHEET_WIDTH, Math.ceil(longestOptionWidth)),
    Math.max(0, viewportWidth - margin * 2),
  );
}
