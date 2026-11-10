import { AnnotatableTextRegion } from "./ExamTextAnnotations.jsx";
import ScopedExplanation from "./ScopedExplanation.jsx";
import { hasScopedExplanation } from "./explanationVisibility.js";
import { buildSpeakerMatchingRows, speakerMatchingAnswerIsCorrect } from "../../utils/speakerMatching.js";

export default function SpeakerMatchingExercise({
  exercise,
  valueFor,
  onChange,
  disabled = false,
  review = false,
  questionNumberFor = (_row, index) => index + 1,
  annotationRegionPrefix = "speaker-matching",
}) {
  const rows = buildSpeakerMatchingRows(exercise);

  return <div className="listening-exercise-c1-speaker-matching">
    <div className="listening-exercise-c1-speaker-rows">
      {rows.map((row, index) => {
        const value = valueFor(row.question) || "";
        const isCorrect = review && speakerMatchingAnswerIsCorrect(row, value);
        return <article
          className={`listening-exercise-c1-speaker-row${isCorrect ? " is-correct" : review ? " is-wrong" : ""}`}
          key={row.question.id}
        >
          <div className="listening-exercise-c1-speaker-row__heading">
            <span className="listening-exercise-c1-speaker-row__number">{questionNumberFor(row, index)}</span>
            <h3>{row.speakerText}</h3>
          </div>
          <div className="listening-exercise-c1-speaker-select">
            <select
              aria-label={row.speakerText}
              className={isCorrect ? "is-correct" : review ? "is-wrong" : ""}
              value={value}
              disabled={disabled}
              onChange={(event) => onChange(row.question, event.target.value)}
            >
              <option value="">Bitte wählen</option>
              {row.statements.map((statement) => <option key={statement.key} value={statement.key}>
                {statement.key}. {statement.text}
              </option>)}
            </select>
          </div>
          {review ? <div className="listening-exercise-c1-speaker-feedback">
            <strong>{isCorrect ? "Richtig" : value ? "Falsch" : "未作答"}</strong>
            <p>Richtige Antwort: {row.correctStatementKey}</p>
            {hasScopedExplanation(row.question.explanation, row.question.answer_options || []) ? <p>
              Erklärung: <AnnotatableTextRegion as="span" regionId={`${annotationRegionPrefix}:explanation:${row.question.id}`}>
                <ScopedExplanation
                  explanation={row.question.explanation}
                  explanationScope={row.question.explanation_scope}
                  options={row.question.answer_options || []}
                />
              </AnnotatableTextRegion>
            </p> : null}
          </div> : null}
        </article>;
      })}
    </div>
  </div>;
}
