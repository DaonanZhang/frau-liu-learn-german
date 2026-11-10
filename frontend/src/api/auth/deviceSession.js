const DEVICE_ACTIVITY_STORAGE_KEY = "accountDeviceActivityId";

let recoveryPromise = null;
let expiredSessionError = null;
const expiryListeners = new Set();

export class DeviceSessionError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "DeviceSessionError";
    this.status = status;
    this.data = data;
  }
}

export function getOrCreateDeviceActivityId() {
  const existing = localStorage.getItem(DEVICE_ACTIVITY_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const activityId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_ACTIVITY_STORAGE_KEY, activityId);
  return activityId;
}

export function clearDeviceActivityId(expectedActivityId = null) {
  if (
    expectedActivityId === null ||
    localStorage.getItem(DEVICE_ACTIVITY_STORAGE_KEY) === expectedActivityId
  ) {
    localStorage.removeItem(DEVICE_ACTIVITY_STORAGE_KEY);
  }
}

export async function heartbeatDeviceSession(activityId) {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) {
    throw new DeviceSessionError("No refresh token", { status: 401 });
  }
  const response = await fetch("/api/accounts/auth/device-heartbeat/", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh: refreshToken, activity_id: activityId }),
    credentials: "include",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new DeviceSessionError(`Device heartbeat failed: ${response.status}`, {
      status: response.status,
      data,
    });
  }
}

function isTerminalRecoveryError(error) {
  return [401, 403, 409].includes(Number(error?.status));
}

export function markDeviceSessionExpired(error) {
  if (!isTerminalRecoveryError(error) || expiredSessionError) {
    return false;
  }
  expiredSessionError = error;
  for (const listener of expiryListeners) {
    listener(error);
  }
  return true;
}

export function isDeviceSessionExpired() {
  return expiredSessionError !== null;
}

export function subscribeToDeviceSessionExpiry(listener) {
  expiryListeners.add(listener);
  if (expiredSessionError) {
    listener(expiredSessionError);
  }
  return () => expiryListeners.delete(listener);
}

export function resetDeviceSessionExpiry() {
  expiredSessionError = null;
}

async function runDeviceSessionRecovery() {
  let activityId = getOrCreateDeviceActivityId();
  try {
    await heartbeatDeviceSession(activityId);
  } catch (error) {
    if (error?.status !== 409 || error?.data?.code !== "device_activity_closed") {
      throw error;
    }
    clearDeviceActivityId(activityId);
    activityId = getOrCreateDeviceActivityId();
    await heartbeatDeviceSession(activityId);
  }
}

export function recoverDeviceSession() {
  if (expiredSessionError) {
    return Promise.reject(expiredSessionError);
  }
  if (recoveryPromise) {
    return recoveryPromise;
  }
  recoveryPromise = runDeviceSessionRecovery()
    .catch((error) => {
      markDeviceSessionExpired(error);
      throw error;
    })
    .finally(() => {
      recoveryPromise = null;
    });
  return recoveryPromise;
}

export function releaseDeviceSession() {
  const refreshToken = localStorage.getItem("refreshToken");
  const activityId = localStorage.getItem(DEVICE_ACTIVITY_STORAGE_KEY);
  if (!refreshToken || !activityId) {
    return;
  }

  const payload = new URLSearchParams({
    refresh: refreshToken,
    activity_id: activityId,
  });
  clearDeviceActivityId(activityId);
  const queued = navigator.sendBeacon?.(
    "/api/accounts/auth/device-release/",
    payload,
  );
  if (!queued) {
    fetch("/api/accounts/auth/device-release/", {
      method: "POST",
      body: payload,
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  }
}
