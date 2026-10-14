import { useEffect, useMemo, useState } from "react";

const AUDIO_LOAD_ERROR = "听力音频加载失败，请刷新页面后重试。";
const RETRY_DELAYS = [1_000, 2_000, 4_000];

export { AUDIO_LOAD_ERROR };

function wait(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delay);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

async function loadAudio(url, signal) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    if (attempt > 0) await wait(RETRY_DELAYS[attempt - 1], signal);
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
      return await response.blob();
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export default function useReliableAudioSources(urls) {
  const key = useMemo(() => [...new Set(urls.filter(Boolean))].join("\n"), [urls]);
  const [sources, setSources] = useState({});
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    const requestedUrls = key ? key.split("\n") : [];
    const controller = new AbortController();
    const objectUrls = [];

    Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setSources({});
        setStatuses(Object.fromEntries(requestedUrls.map((url) => [url, "loading"])));
      }
    });

    requestedUrls.forEach(async (url) => {
      try {
        const blob = await loadAudio(url, controller.signal);
        if (controller.signal.aborted) return;
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        if (!controller.signal.aborted) {
          setSources((previous) => ({ ...previous, [url]: objectUrl }));
          setStatuses((previous) => ({ ...previous, [url]: "ready" }));
        }
      } catch {
        if (!controller.signal.aborted) {
          setStatuses((previous) => ({ ...previous, [url]: "error" }));
        }
      }
    });

    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [key]);

  return { sources, statuses };
}
