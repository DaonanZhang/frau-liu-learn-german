import { apiFetch } from "../client.js";

const BASE = "/learning_by_video/user-video-notes";

export function fetchUserVideoNote(videoId) {
  return apiFetch(`${BASE}/by-video/${Number(videoId)}/`, {
    method: "GET",
  });
}

export function saveUserVideoNote(videoId, noteMarkdown) {
  return apiFetch(`${BASE}/by-video/${Number(videoId)}/`, {
    method: "PUT",
    body: {
      note_markdown: String(noteMarkdown || ""),
    },
  });
}
