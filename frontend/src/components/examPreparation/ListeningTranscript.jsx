import "./ListeningTranscript.css";

export default function ListeningTranscript({ script }) {
  const transcript = String(script || "").trim();
  if (!transcript) {
    return null;
  }

  return (
    <section className="listening-transcript" aria-labelledby="listening-transcript-title">
      <div className="listening-transcript__header">
        <span>Transkript</span>
        <h2 id="listening-transcript-title">录音文本</h2>
      </div>
      <div className="listening-transcript__body">{transcript}</div>
    </section>
  );
}
