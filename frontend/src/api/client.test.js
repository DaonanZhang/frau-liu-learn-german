import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./client.js";
import {
  isDeviceSessionExpired,
  markDeviceSessionExpired,
  resetDeviceSessionExpiry,
} from "./auth/deviceSession.js";

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(""),
  };
}

function emptyResponse(status = 204) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "" },
    json: vi.fn().mockResolvedValue(null),
    text: vi.fn().mockResolvedValue(""),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("apiFetch device session recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("accessToken", "access-token");
    localStorage.setItem("refreshToken", "refresh-token");
    localStorage.setItem("accountDeviceActivityId", "activity-1");
    resetDeviceSessionExpiry();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("recovers an inactive device session and replays the request once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: "device_session_inactive" }))
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(jsonResponse(200, { id: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/videos/7/")).resolves.toEqual({ id: 7 });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/videos/7/",
      "/api/accounts/auth/device-heartbeat/",
      "/api/videos/7/",
    ]);
  });

  it("does not replay a request more than once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: "device_session_inactive" }))
      .mockResolvedValueOnce(emptyResponse())
      .mockResolvedValueOnce(jsonResponse(403, { code: "device_session_inactive" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/videos/7/")).rejects.toMatchObject({ status: 403 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(isDeviceSessionExpired()).toBe(true);
  });

  it("gates later authenticated requests after terminal recovery failure", async () => {
    const terminalError = Object.assign(new Error("session expired"), {
      status: 403,
      data: { code: "concurrent_session_limit" },
    });
    markDeviceSessionExpired(terminalError);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 8 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/subtitles/")).rejects.toMatchObject({ status: 403 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coalesces recovery when two requests become inactive together", async () => {
    const heartbeat = deferred();
    const attempts = new Map();
    let heartbeatCalls = 0;
    const fetchMock = vi.fn((url) => {
      if (url === "/api/accounts/auth/device-heartbeat/") {
        heartbeatCalls += 1;
        return heartbeat.promise;
      }
      const attempt = (attempts.get(url) || 0) + 1;
      attempts.set(url, attempt);
      return Promise.resolve(
        attempt === 1
          ? jsonResponse(403, { code: "device_session_inactive" })
          : jsonResponse(200, { url }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = apiFetch("/videos/1/");
    const second = apiFetch("/videos/2/");
    await vi.waitFor(() => expect(heartbeatCalls).toBe(1));
    heartbeat.resolve(emptyResponse());

    await expect(Promise.all([first, second])).resolves.toEqual([
      { url: "/api/videos/1/" },
      { url: "/api/videos/2/" },
    ]);
    expect(heartbeatCalls).toBe(1);
  });

  it("does not enter terminal state for a network failure during recovery", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: "device_session_inactive" }))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse(200, { id: 8 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/videos/7/")).rejects.toThrow("offline");
    expect(isDeviceSessionExpired()).toBe(false);
    await expect(apiFetch("/videos/8/")).resolves.toEqual({ id: 8 });
  });

  it("does not run recovery for unrelated server errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { detail: "error" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/videos/7/")).rejects.toMatchObject({ status: 500 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(isDeviceSessionExpired()).toBe(false);
  });
});
