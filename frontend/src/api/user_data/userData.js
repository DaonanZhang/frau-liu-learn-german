import { apiFetch } from "../client";

/**
 * Mark current user as active for today (counted once per calendar day).
 *
 * Optional query param:
 * - days: number of recent days to include in active_dates (default handled by backend)
 *
 * @param {{ days?: number }=} params
 * @returns {Promise<{
 *   incremented: boolean,
 *   user_data: {
 *     ui_language: string,
 *     learning_language: string,
 *     active_days: number,
 *     last_active_date: string | null,
 *     active_dates: string[],
 *     created_at: string,
 *     updated_at: string,
 *   }
 * }>}
 */
export async function markUserDailyActive(params = {}) {
  const days = Number.isFinite(Number(params?.days)) ? Number(params.days) : null;
  const query = days ? `?days=${encodeURIComponent(String(days))}` : "";

  return apiFetch(`/accounts/user-data/mark-daily-active/${query}`, {
    method: "POST",
  });
}

/**
 * Fetch current user's user_data without mutating counters.
 *
 * Optional query param:
 * - days: number of recent days to include in active_dates (default handled by backend)
 *
 * @param {{ days?: number }=} params
 * @returns {Promise<{
 *   ui_language: string,
 *   learning_language: string,
 *   active_days: number,
 *   last_active_date: string | null,
 *   active_dates: string[],
 *   created_at: string,
 *   updated_at: string,
 * }>}
 */
export async function fetchMyUserData(params = {}) {
  const days = Number.isFinite(Number(params?.days)) ? Number(params.days) : null;
  const query = days ? `?days=${encodeURIComponent(String(days))}` : "";

  return apiFetch(`/accounts/user-data/me/${query}`, {
    method: "GET",
  });
}

/**
 * Mark daily active and return only the user_data payload.
 *
 * @param {{ days?: number }=} params
 * @returns {Promise<{
 *   ui_language: string,
 *   learning_language: string,
 *   active_days: number,
 *   last_active_date: string | null,
 *   active_dates: string[],
 *   created_at: string,
 *   updated_at: string,
 * } | null>}
 */
export async function markDailyActiveAndGetUserData(params = {}) {
  const data = await markUserDailyActive(params);
  return data?.user_data || null;
}
