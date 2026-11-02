import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getOrCreateDeviceActivityId,
  isDeviceSessionExpired,
  recoverDeviceSession,
  resetDeviceSessionExpiry,
  subscribeToDeviceSessionExpiry,
} from "./deviceSession.js";

function response(status, data = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("device session recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDeviceSessionExpiry();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.setItem("refreshToken", "refresh-token");
    localStorage.setItem("accountDeviceActivityId", "activity-old");
  });

  it("keeps the current activity when the heartbeat succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(204));
    vi.stubGlobal("fetch", fetchMock);

    await recoverDeviceSession();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      refresh: "refresh-token",
      activity_id: "activity-old",
    });
    expect(getOrCreateDeviceActivityId()).toBe("activity-old");
    expect(isDeviceSessionExpired()).toBe(false);
  });

  it("rotates a closed activity and retries the heartbeat once", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "activity-new") });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(409, { code: "device_activity_closed" }))
      .mockResolvedValueOnce(response(204));
    vi.stubGlobal("fetch", fetchMock);

    await recoverDeviceSession();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      refresh: "refresh-token",
      activity_id: "activity-new",
    });
    expect(localStorage.getItem("accountDeviceActivityId")).toBe("activity-new");
    expect(isDeviceSessionExpired()).toBe(false);
  });

  it("coalesces concurrent recovery calls into one heartbeat", async () => {
    const pending = deferred();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    const first = recoverDeviceSession();
    const second = recoverDeviceSession();
    pending.resolve(response(204));

    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("publishes one terminal expiry when activity recovery still conflicts", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "activity-new") });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(409, { code: "device_activity_closed" }))
        .mockResolvedValueOnce(response(409, { code: "device_activity_closed" })),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToDeviceSessionExpiry(listener);

    await expect(recoverDeviceSession()).rejects.toMatchObject({
      status: 409,
      data: { code: "device_activity_closed" },
    });

    expect(isDeviceSessionExpired()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("does not mark an ordinary network failure as an expired session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const listener = vi.fn();
    const unsubscribe = subscribeToDeviceSessionExpiry(listener);

    await expect(recoverDeviceSession()).rejects.toThrow("offline");

    expect(isDeviceSessionExpired()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
