import { apiFetch } from "../client";

/**
 * Mark current user as active for today.
 *
 * This endpoint should be called once when the user enters the homepage.
 * The backend guarantees that active_days is incremented at most once per day.
 *
 * @returns {Promise<{
 *   incremented: boolean,
 *   user_data: {
 *     ui_language: string,
 *     learning_language: string,
 *     active_days: number,
 *     last_active_date: string | null,
 *     created_at: string,
 *     updated_at: string,
 *   }
 * }>}
 */
export async function markUserDailyActive() {
  return apiFetch("/user-data/mark-daily-active/", {
    method: "POST",
  });
}
