import { useEffect, useRef, useState } from "react";
import "./SpeakingPracticeRecorder.css";

function pickRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  return [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/webm",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

const COPY = {
  de: {
    unsupported: "Dieser Browser unterstützt keine Audioaufnahme.",
    permissionDenied: "Bitte erlauben Sie den Zugriff auf das Mikrofon.",
    microphoneError: "Das Mikrofon konnte nicht geöffnet werden.",
    recordingError: "Die Aufnahme konnte nicht erstellt werden.",
    eyebrow: "Nachsprechen",
    title: "Lesen Sie die richtige Antwort laut vor",
    privacy: "Die Aufnahme bleibt nur in diesem Browserfenster und wird nicht hochgeladen.",
    start: "Aufnahme starten",
    stop: "Aufnahme stoppen",
    running: "Aufnahme läuft …",
    playbackUnsupported: "Ihr Browser unterstützt die Audiowiedergabe nicht.",
  },
  zh: {
    unsupported: "当前浏览器不支持录音功能。",
    permissionDenied: "请允许浏览器访问麦克风。",
    microphoneError: "无法打开麦克风，请检查设备或浏览器权限。",
    recordingError: "录音失败，请重新尝试。",
    eyebrow: "跟读练习",
    title: "请朗读上方的正确答案",
    privacy: "录音只保留在当前浏览器页面中，不会上传到服务器。",
    start: "开始录音",
    stop: "停止录音",
    running: "正在录音…",
    playbackUnsupported: "当前浏览器不支持音频播放。",
  },
};

export default function SpeakingPracticeRecorder({ language = "de" }) {
  const copy = COPY[language] || COPY.de;
  const mountedRef = useRef(true);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingUrlRef = useRef("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordingUrlRef.current) {
        URL.revokeObjectURL(recordingUrlRef.current);
      }
    };
  }, []);

  async function startRecording() {
    setErrorText("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErrorText(copy.unsupported);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!mountedRef.current) {
          chunksRef.current = [];
          return;
        }
        const blobType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        if (recordingUrlRef.current) {
          URL.revokeObjectURL(recordingUrlRef.current);
        }
        const nextUrl = URL.createObjectURL(blob);
        recordingUrlRef.current = nextUrl;
        setRecordingUrl(nextUrl);
        chunksRef.current = [];
        setIsRecording(false);
      });
      recorder.addEventListener("error", () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (mountedRef.current) {
          setErrorText(copy.recordingError);
          setIsRecording(false);
        }
      });

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      if (mountedRef.current) {
        setErrorText(
          error?.name === "NotAllowedError"
            ? copy.permissionDenied
            : copy.microphoneError
        );
      }
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  return (
    <section className="speaking-recorder" aria-labelledby="speaking-recorder-title">
      <div className="speaking-recorder__copy">
        <span className="speaking-recorder__eyebrow">{copy.eyebrow}</span>
        <h2 id="speaking-recorder-title">{copy.title}</h2>
        <p>{copy.privacy}</p>
      </div>
      <div className="speaking-recorder__controls">
        <button
          type="button"
          className={isRecording ? "speaking-recorder__button is-recording" : "speaking-recorder__button"}
          onClick={isRecording ? stopRecording : startRecording}
        >
          <span className="speaking-recorder__button-icon" aria-hidden="true">
            {isRecording ? "■" : "●"}
          </span>
          {isRecording ? copy.stop : copy.start}
        </button>
        {recordingUrl ? (
          <audio className="speaking-recorder__audio" controls src={recordingUrl}>
            {copy.playbackUnsupported}
          </audio>
        ) : null}
      </div>
      {isRecording ? <p className="speaking-recorder__status">{copy.running}</p> : null}
      {errorText ? <p className="speaking-recorder__error" role="alert">{errorText}</p> : null}
    </section>
  );
}
