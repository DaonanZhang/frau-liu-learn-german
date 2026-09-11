import FormattedExplanation from "./FormattedExplanation.jsx";
import "./ScopedExplanation.css";


export default function ScopedExplanation({
  explanation = "",
  explanationScope = "question",
  options = [],
}) {
  const questionExplanation = String(explanation || "").trim();
  const explainedOptions = options.filter((option) => String(option?.explanation || "").trim());
  const shouldShowOptions =
    explanationScope === "option" || (!questionExplanation && explainedOptions.length > 1);

  if (!questionExplanation && !explainedOptions.length) {
    return null;
  }

  if (shouldShowOptions) {
    return (
      <span className="scoped-explanation-options">
        {explainedOptions.map((option) => (
          <span key={option.id || option.option_key} className="scoped-explanation-option">
            <strong className="scoped-explanation-option__label">
              {String(option.option_key || "").toLocaleUpperCase()}
              {option.option_text ? ` – ${option.option_text}` : ""}
            </strong>
            <FormattedExplanation text={option.explanation} />
          </span>
        ))}
      </span>
    );
  }

  return (
    <FormattedExplanation
      text={questionExplanation || explainedOptions[0]?.explanation || ""}
    />
  );
}
