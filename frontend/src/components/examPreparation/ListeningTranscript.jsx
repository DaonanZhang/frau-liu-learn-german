import "./ListeningTranscript.css";

export default function ListeningTranscript({ script }) {
  const transcript = String(script || "").trim();
  if (!transcript) {
    return null;
  }

  return (
    <details className="listening-transcript" open>
      <summary className="listening-transcript__summary">
        <span className="listening-transcript__heading">
          <span>Transkript</span>
          <strong>录音文本</strong>
        </span>
        <span className="listening-transcript__chevron" aria-hidden="true" />
      </summary>
      <div className="listening-transcript__body">{transcript}</div>
    </details>
  );
}
