export function hasScopedExplanation(explanation = "", options = []) {
  return Boolean(
    String(explanation || "").trim()
      || options.some((option) => String(option?.explanation || "").trim()),
  );
}
