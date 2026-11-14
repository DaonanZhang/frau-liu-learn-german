import { AnnotatableTextRegion } from "./ExamTextAnnotations.jsx";

export default function SpeakingTaskBox({ text }) {
  if (!String(text || "").trim()) return null;

  return (
    <div role="group" aria-label="Aufgabe">
      <AnnotatableTextRegion as="p" className="speaking-detail-task__text" regionId="material:task">
        {text}
      </AnnotatableTextRegion>
    </div>
  );
}
