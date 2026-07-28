import "./FormattedExplanation.css";

const YELLOW_MARK_PATTERN = /<黄>([\s\S]*?)<\/黄>/g;

function splitExplanation(text) {
  const value = String(text || "");
  const parts = [];
  let lastIndex = 0;

  for (const match of value.matchAll(YELLOW_MARK_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), highlighted: false });
    }
    parts.push({ text: match[1], highlighted: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), highlighted: false });
  }

  return parts.length ? parts : [{ text: value, highlighted: false }];
}

export default function FormattedExplanation({
  text,
  fallback = "Keine zusätzliche Erklärung.",
}) {
  const value = String(text || "").trim() ? String(text) : fallback;

  return (
    <span className="formatted-explanation">
      {splitExplanation(value).map((part, index) => (
        part.highlighted ? (
          <mark key={`${index}-${part.text}`} className="formatted-explanation__yellow">
            {part.text}
          </mark>
        ) : (
          <span key={`${index}-${part.text}`}>{part.text}</span>
        )
      ))}
    </span>
  );
}
