import { useEffect, useRef, useState } from "react";
import { playSpeakingAudio } from "../../utils/speakingAudio.js";
import "./SpeechButton.css";

export default function SpeechButton({ audioUrl = "", language = "zh", disabled = false }) {
  const sessionRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const copy = language === "zh"
    ? { speak: "朗读", stop: "停止朗读", unavailable: "音频尚未生成", failed: "音频播放失败，请重试。" }
    : { speak: "Vorlesen", stop: "Vorlesen stoppen", unavailable: "Audio noch nicht verfügbar", failed: "Audiowiedergabe fehlgeschlagen. Bitte erneut versuchen." };

  useEffect(() => () => sessionRef.current?.cancel(), [audioUrl]);

  function toggleSpeech() {
    setError("");
    if (sessionRef.current?.active) {
      sessionRef.current.cancel();
      return;
    }
    setSpeaking(true);
    sessionRef.current = playSpeakingAudio(audioUrl, {
      onStop: () => setSpeaking(false),
      onError: () => setError(copy.failed),
    });
  }

  return (
    <div className="speaking-speech">
      <button type="button" className={`speaking-speech__button${speaking ? " is-speaking" : ""}`} onClick={toggleSpeech} disabled={disabled || !audioUrl} aria-pressed={speaking} aria-label={audioUrl ? speaking ? copy.stop : copy.speak : copy.unavailable} title={audioUrl ? speaking ? copy.stop : copy.speak : copy.unavailable}>
        {speaking ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10v4M7.5 6v12M12 3v18M16.5 6v12M21 10v4" /></svg>}
      </button>
      {error ? <span className="speaking-speech__error" role="alert">{error}</span> : null}
    </div>
  );
}
