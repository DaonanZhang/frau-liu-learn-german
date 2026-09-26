import { useEffect, useMemo, useRef, useState } from "react";
import { buildRecordingKey, loadRecordingBlob, saveRecordingBlob } from "../../api/learning_by_video/shadowingStorage.js";
import { claimSpeakingAudio } from "../../utils/speakingAudio.js";
import SpeechButton from "./SpeechButton.jsx";
import "../../pages/VideoStudy/components/ShadowingPractice.css";

const MIME_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function buildBlob(chunks, recorder) {
  const chunk = chunks.find((item) => item?.size > 0);
  return new Blob(chunks, { type: chunk?.type || recorder?.mimeType || "audio/mp4" });
}

export default function SpeakingPracticeRecorder({ language = "de", recordingId = "default", audioUrl = "" }) {
  const copy = language === "zh"
    ? { start: "开始录音", stop: "停止录音", play: "播放录音", rerecord: "重新录制", unsupported: "当前浏览器不支持录音功能。", permission: "请允许浏览器访问麦克风。", error: "录音或播放失败，请重新尝试。" }
    : { start: "Aufnahme starten", stop: "Aufnahme stoppen", play: "Aufnahme abspielen", rerecord: "Neu aufnehmen", unsupported: "Dieser Browser unterstützt keine Audioaufnahme.", permission: "Bitte erlauben Sie den Zugriff auf das Mikrofon.", error: "Die Aufnahme oder Wiedergabe ist fehlgeschlagen." };
  const recordingKey = useMemo(() => buildRecordingKey("speaking", recordingId), [recordingId]);
  const recorderRef = useRef(null);
  const sessionRef = useRef(null);
  const mountedRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    loadRecordingBlob(recordingKey).then((blob) => {
      if (active) setHasRecording(Boolean(blob));
    }).catch(() => {});
    return () => {
      active = false;
      mountedRef.current = false;
      sessionRef.current?.cancel();
    };
  }, [recordingKey]);

  async function startRecording() {
    setErrorText("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorText(copy.unsupported);
      return;
    }
    let stream;
    let recorder;
    const session = claimSpeakingAudio(() => {
      if (recorder?.state === "recording") recorder.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) {
        setIsStarting(false);
        setIsRecording(false);
      }
    });
    sessionRef.current = session;
    setIsStarting(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!session.active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = pickMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        session.finish();
        stream.getTracks().forEach((track) => track.stop());
        if (recorderRef.current === recorder) {
          recorderRef.current = null;
          if (mountedRef.current) setIsRecording(false);
        }
        try {
          await saveRecordingBlob(recordingKey, buildBlob(chunks, recorder));
          if (mountedRef.current) setHasRecording(true);
        } catch {
          if (mountedRef.current) setErrorText(copy.error);
        }
      };
      recorder.onerror = () => {
        if (!session.active) return;
        session.cancel();
        if (mountedRef.current) setErrorText(copy.error);
      };
      recorder.start();
      setIsStarting(false);
      setIsRecording(true);
    } catch (error) {
      if (!session.active) return;
      session.cancel();
      setErrorText(error?.name === "NotAllowedError" ? copy.permission : copy.error);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function playRecording() {
    setErrorText("");
    let audio;
    let objectUrl;
    const session = claimSpeakingAudio(() => {
      audio?.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    sessionRef.current = session;
    try {
      const blob = await loadRecordingBlob(recordingKey);
      if (!session.active) return;
      if (!blob) {
        session.finish();
        setHasRecording(false);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audio.onended = () => session.cancel();
      audio.onerror = () => {
        if (!session.active) return;
        session.cancel();
        setErrorText(copy.error);
      };
      await audio.play();
    } catch {
      if (!session.active) return;
      session.cancel();
      setErrorText(copy.error);
    }
  }

  return (
    <div className="shadowing-practice-bar speaking-practice-recorder" onClick={(event) => event.stopPropagation()}>
      <div className="shadowing-practice-buttons" aria-label="口语录音">
        {!isRecording ? (
          <button type="button" className="shadowing-btn shadowing-btn-danger" aria-label={copy.start} title={copy.start} onClick={startRecording} disabled={isStarting}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 18v4" /><path d="M8 22h8" /></svg>
          </button>
        ) : (
          <button type="button" className="shadowing-btn shadowing-btn-danger" aria-label={copy.stop} onClick={stopRecording}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
          </button>
        )}
        <button type="button" className={`shadowing-btn ${hasRecording ? "shadowing-btn-success" : "shadowing-btn-secondary"}`} aria-label={copy.play} title={copy.play} onClick={playRecording} disabled={!hasRecording || isRecording || isStarting}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18 6a8.5 8.5 0 0 1 0 12" /></svg>
        </button>
        <button type="button" className={`shadowing-btn ${hasRecording ? "shadowing-btn-primary" : "shadowing-btn-secondary"}`} aria-label={copy.rerecord} title={copy.rerecord} onClick={startRecording} disabled={!hasRecording || isRecording || isStarting}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7h-5V2" /><path d="M20 2l-3.5 3.5A8 8 0 1 0 20 12" /></svg>
        </button>
        <SpeechButton audioUrl={audioUrl} language={language} disabled={isRecording || isStarting} />
      </div>
      {isRecording ? <div className="shadowing-practice-error" role="status">{copy.stop}</div> : null}
      {errorText ? <div className="shadowing-practice-error" role="alert">{errorText}</div> : null}
    </div>
  );
}
