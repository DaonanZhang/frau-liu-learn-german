import { apiFetch } from "./client";

/**
 * Base prefix derived from backend:
 * path("api/announcement/", include("apps.announcement.urls"))
 */
const BASE = "/announcement";

function normalizeList(data) {
  if (Array.isArray(data)) return { results: data, count: data.length };
  if (data && Array.isArray(data.results)) {
    return { results: data.results, count: data.count ?? data.results.length };
  }
  return { results: [], count: 0 };
}

/**
 * Fetch announcements list.
 * Supported ordering: created_at, priority
 */
export async function fetchAnnouncementList({ ordering } = {}) {
  const sp = new URLSearchParams();
  if (ordering) sp.set("ordering", ordering);

  const qs = sp.toString();
  const path = qs ? `${BASE}/announcements/?${qs}` : `${BASE}/announcements/`;

  const data = await apiFetch(path);
  return normalizeList(data);
}
