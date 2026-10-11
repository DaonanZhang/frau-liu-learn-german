import { AnnotatableTextRegion } from "./ExamTextAnnotations.jsx";
import "./ListeningTranscript.css";

export default function ListeningTranscript({
  script,
  annotationRegionPrefix,
  annotationsEnabled = false,
}) {
  const transcript = String(script || "").trim();
  if (!transcript) {
    return null;
  }

  const Body = annotationsEnabled && annotationRegionPrefix ? AnnotatableTextRegion : "div";
  const bodyProps = annotationsEnabled && annotationRegionPrefix
    ? { as: "div", regionId: `${annotationRegionPrefix}:script` }
    : {};

  return (
    <details className="listening-transcript" open>
      <summary className="listening-transcript__summary">
        <span className="listening-transcript__heading">
          <span>Transkript</span>
          <strong>录音文本</strong>
        </span>
        <span className="listening-transcript__chevron" aria-hidden="true" />
      </summary>
      <Body {...bodyProps} className="listening-transcript__body">{transcript}</Body>
    </details>
  );
}
