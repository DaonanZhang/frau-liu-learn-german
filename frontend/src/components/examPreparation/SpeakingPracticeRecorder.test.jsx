import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadRecordingBlob, saveRecordingBlob } from "../../api/learning_by_video/shadowingStorage.js";
import SpeakingPracticeRecorder from "./SpeakingPracticeRecorder.jsx";

vi.mock("../../api/learning_by_video/shadowingStorage.js", () => ({
  buildRecordingKey: (_scope, id) => `speaking:${id}`,
  loadRecordingBlob: vi.fn(),
  saveRecordingBlob: vi.fn(),
}));

let recorders;
let tracks;

class MockMediaRecorder {
  static isTypeSupported = () => true;

  constructor(stream) {
    this.stream = stream;
    this.state = "inactive";
    this.mimeType = "audio/webm";
    recorders.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.stopCalls = (this.stopCalls || 0) + 1;
  }
}

async function finishRecorder(recorder) {
  await act(async () => recorder.onstop());
}

beforeEach(() => {
  recorders = [];
  tracks = [{ stop: vi.fn() }];
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) },
  });
  loadRecordingBlob.mockResolvedValue(null);
  saveRecordingBlob.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SpeakingPracticeRecorder", () => {
  it("renders a trailing control immediately after the sample audio button", () => {
    render(
      <SpeakingPracticeRecorder
        recordingId="answer"
        language="zh"
        audioUrl="/audio/sample.mp3"
        trailingControl={<button type="button" aria-label="翻译">Aa</button>}
      />,
    );

    const translationButton = screen.getByRole("button", { name: "翻译" });
    const sampleAudioButton = screen.getByRole("button", { name: "朗读" });
    const controls = translationButton.closest(".shadowing-practice-buttons");

    expect(sampleAudioButton.closest(".shadowing-practice-buttons")).toBe(controls);
    expect(sampleAudioButton.parentElement.nextElementSibling).toBe(translationButton);
  });

  it("stops an unmounted recording without saving its partial audio", async () => {
    const { unmount } = render(<SpeakingPracticeRecorder recordingId="answer" />);
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await act(async () => {});

    const recorder = recorders[0];
    unmount();
    await finishRecorder(recorder);

    expect(recorder.stopCalls).toBe(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(saveRecordingBlob).not.toHaveBeenCalled();
  });

  it("saves exactly once after an explicit stop", async () => {
    render(<SpeakingPracticeRecorder recordingId="answer" />);
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await act(async () => {});

    const recorder = recorders[0];
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }));
    await finishRecorder(recorder);
    await act(async () => {});

    expect(saveRecordingBlob).toHaveBeenCalledTimes(1);
  });

  it("keeps an explicitly stopped recording when unmounted before onstop", async () => {
    const { unmount } = render(<SpeakingPracticeRecorder recordingId="answer" />);
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await act(async () => {});

    const recorder = recorders[0];
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }));
    unmount();
    await finishRecorder(recorder);

    expect(saveRecordingBlob).toHaveBeenCalledTimes(1);
  });

  it("enables playback in a remounted recorder when the prior save completes", async () => {
    let completeSave;
    saveRecordingBlob.mockImplementation(() => new Promise((resolve) => {
      completeSave = resolve;
    }));

    const first = render(<SpeakingPracticeRecorder recordingId="answer" />);
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await act(async () => {});
    const recorder = recorders[0];
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }));
    first.unmount();

    render(<SpeakingPracticeRecorder recordingId="answer" />);
    const playButton = screen.getByRole("button", { name: "Aufnahme abspielen" });
    expect(playButton).toBeDisabled();

    const saving = recorder.onstop();
    expect(saveRecordingBlob).toHaveBeenCalledTimes(1);
    await act(async () => {
      completeSave();
      await saving;
    });

    expect(playButton).toBeEnabled();
  });

  it("keeps playback enabled when a stale initial read resolves after the save notification", async () => {
    let completeLoad;
    loadRecordingBlob
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => new Promise((resolve) => {
        completeLoad = resolve;
      }));

    const first = render(<SpeakingPracticeRecorder recordingId="answer" />);
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await act(async () => {});
    const recorder = recorders[0];
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }));
    first.unmount();

    render(<SpeakingPracticeRecorder recordingId="answer" />);
    const playButton = screen.getByRole("button", { name: "Aufnahme abspielen" });
    await finishRecorder(recorder);
    expect(playButton).toBeEnabled();

    await act(async () => completeLoad(null));
    expect(playButton).toBeEnabled();
  });

  it("discards a recording cancelled by another audio owner", async () => {
    render(<>
      <SpeakingPracticeRecorder recordingId="first" />
      <SpeakingPracticeRecorder recordingId="second" />
    </>);
    fireEvent.click(screen.getAllByRole("button", { name: "Aufnahme starten" })[0]);
    await act(async () => {});

    const recorder = recorders[0];
    fireEvent.click(screen.getAllByRole("button", { name: "Aufnahme starten" })[0]);
    await act(async () => {});
    await finishRecorder(recorder);

    expect(recorder.stopCalls).toBe(1);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(saveRecordingBlob).not.toHaveBeenCalled();
  });
});
