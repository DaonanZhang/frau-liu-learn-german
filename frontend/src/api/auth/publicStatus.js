import { apiFetch } from "../client.js";

export async function fetchPublicStatus() {
  return apiFetch("/accounts/public/status/");
}
