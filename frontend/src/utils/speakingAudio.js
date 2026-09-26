let activeSession = null;

// Share ownership across all dialogue rows, including pending microphone/play requests.
export function claimSpeakingAudio(onCancel) {
  activeSession?.cancel();
  const session = {
    active: true,
    finish() {
      session.active = false;
      if (activeSession === session) activeSession = null;
    },
    cancel() {
      if (!session.active) return;
      session.finish();
      onCancel();
    },
  };
  activeSession = session;
  return session;
}

export function playSpeakingAudio(url, { onStop, onError }) {
  const audio = new Audio(url);
  const session = claimSpeakingAudio(() => {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    onStop();
  });
  audio.onended = () => {
    if (session.active) session.cancel();
  };
  audio.onerror = () => {
    if (!session.active) return;
    session.cancel();
    onError("failed");
  };
  try {
    const playResult = audio.play();
    playResult?.catch(() => {
      if (!session.active) return;
      session.cancel();
      onError("failed");
    });
  } catch {
    session.cancel();
    onError("failed");
  }
  return session;
}
