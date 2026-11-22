import { apiFetch } from "./client.js";

export function reportAudioLoadError(payload) {
  return apiFetch("/accounts/audio-load-errors/", {
    method: "POST",
    body: payload,
  });
}
