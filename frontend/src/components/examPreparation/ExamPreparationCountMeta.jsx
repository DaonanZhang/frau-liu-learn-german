import "./ExamPreparationCountMeta.css";

export default function ExamPreparationCountMeta({ items }) {
  const validItems = (Array.isArray(items) ? items : []).filter(
    ({ value, label }) => Number.isFinite(value) && typeof label === "string" && label.trim(),
  );

  if (!validItems.length) {
    return null;
  }

  return (
    <div
      className="exam-preparation-count-meta"
      aria-label={validItems.map(({ value, label }) => `${value} ${label.trim()}`).join("；")}
    >
      {validItems.map(({ value, label }, index) => (
        <span className="exam-preparation-count-meta__item" key={`${label}-${index}`}>
          {index > 0 ? (
            <span className="exam-preparation-count-meta__separator" aria-hidden="true">·</span>
          ) : null}
          <span className="exam-preparation-count-meta__value">{value}</span>
          <span>{` ${label.trim()}`}</span>
        </span>
      ))}
    </div>
  );
}
