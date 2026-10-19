export function clozeOptionTextForOccurrence(optionText, occurrenceIndex, occurrenceCount) {
  const text = String(optionText || "");
  if (occurrenceCount <= 1) return text;
  const segments = text.split(/\s*(?:…|\.\.\.)\s*/);
  return segments.length === occurrenceCount ? segments[occurrenceIndex] : text;
}
