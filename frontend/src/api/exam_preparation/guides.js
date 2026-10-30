import { apiFetch } from "../client";

const GUIDE_BASE = "/exam_preparation/guides";
const inFlightGuideDetails = new Map();

function normalizeGuideList(data) {
  if (Array.isArray(data)) {
    return { results: data, count: data.length };
  }
  if (data && Array.isArray(data.results)) {
    return data;
  }
  return { results: [], count: 0 };
}

export async function fetchGuides() {
  return normalizeGuideList(await apiFetch(`${GUIDE_BASE}/`));
}

export function fetchGuideDetail(guideId) {
  const requestKey = String(guideId);
  const existingRequest = inFlightGuideDetails.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = apiFetch(`${GUIDE_BASE}/${guideId}/`);
  inFlightGuideDetails.set(requestKey, request);
  const clearRequest = () => {
    if (inFlightGuideDetails.get(requestKey) === request) {
      inFlightGuideDetails.delete(requestKey);
    }
  };
  request.then(clearRequest, clearRequest);
  return request;
}

export function setGuideLiked(guideId, liked) {
  return apiFetch(`${GUIDE_BASE}/${guideId}/like/`, {
    method: liked ? "POST" : "DELETE",
  });
}

export function guideMatchesLevel(guide, level) {
  const normalizedLevel = String(level || "").toUpperCase();
  if (!normalizedLevel) return false;

  const badges = Array.isArray(guide?.badges) ? guide.badges : [];
  const searchableText = [...badges, guide?.title]
    .filter(Boolean)
    .join(" ");
  const levelPattern = new RegExp(`\\bTELC\\s+${normalizedLevel}\\b`, "i");
  return levelPattern.test(searchableText);
}
