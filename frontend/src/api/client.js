/**
 * Lightweight API client.
 * - Uses relative base URL ("/api") so Vite proxy can forward in dev.
 * - Adds JSON headers by default.
 * - Optionally attaches CSRF token (for Django session auth).
 */

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch(path, options = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    // if you plan to use Django session auth, keep credentials:
    credentials = "include",
  } = options;

  const finalHeaders = {
    Accept: "application/json",
    ...headers,
  };

  // JSON body convenience
  const hasBody = body !== undefined && body !== null;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  let finalBody = body;

  if (hasBody && !isFormData && typeof body !== "string") {
    finalHeaders["Content-Type"] = "application/json";
    finalBody = JSON.stringify(body);
  }

  // CSRF (only needed when you use Django session-based auth)
  // For DRF Token/JWT you typically don't need this.
  const csrfToken = getCookie("csrftoken");
  if (csrfToken && !finalHeaders["X-CSRFToken"]) {
    finalHeaders["X-CSRFToken"] = csrfToken;
  }

  const res = await fetch(`/api${path.startsWith("/") ? "" : "/"}${path}`, {
    method,
    headers: finalHeaders,
    body: finalBody,
    credentials,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    throw new ApiError(`API request failed: ${res.status}`, {
      status: res.status,
      data,
    });
  }

  return data;
}
