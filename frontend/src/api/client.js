/**
 * Lightweight API client (JWT-enhanced).
 * - Uses relative base URL ("/api") so Vite proxy can forward in dev.
 * - Adds JSON headers by default.
 * - Optionally attaches CSRF token (for Django session auth).
 * - Auto attaches JWT Authorization header if tokens exist.
 * - Auto refreshes access token once on 401, then retries the request once.
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

function getAccessToken() {
  return localStorage.getItem("accessToken");
}

function getRefreshToken() {
  return localStorage.getItem("refreshToken");
}

function setAccessToken(token) {
  localStorage.setItem("accessToken", token);
}

function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) {
    throw new Error("No refresh token");
  }

  const res = await fetch("/api/accounts/auth/refresh/", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    clearTokens();
    throw new Error("Refresh failed");
  }

  const data = await res.json().catch(() => null);
  if (!data?.access) {
    clearTokens();
    throw new Error("No access token returned from refresh");
  }

  setAccessToken(data.access);
  return data.access;
}

export async function apiFetch(path, options = {}, retried = false) {
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

  // Attach JWT if available
  const accessToken = getAccessToken();
  if (accessToken && !finalHeaders.Authorization) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

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

  // If unauthorized once, try refresh and retry once
  if (res.status === 401 && !retried) {
    try {
      const newAccess = await refreshAccessToken();
      return apiFetch(
        path,
        {
          ...options,
          headers: {
            ...headers,
            Authorization: `Bearer ${newAccess}`,
          },
        },
        true
      );
    } catch {
      throw new ApiError("Unauthorized", { status: 401, data });
    }
  }

  if (!res.ok) {
    throw new ApiError(`API request failed: ${res.status}`, {
      status: res.status,
      data,
    });
  }

  return data;
}
