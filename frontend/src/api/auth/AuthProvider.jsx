// src/api/AuthProvider.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthContext } from "./AuthContext.jsx";
import { apiFetch } from "../client.js";
import {
  heartbeatDeviceSession,
  logout as clearAuthTokens,
  releaseDeviceSession,
} from "./index.js";

const DEVICE_TAB_STORAGE_KEY = "accountActiveDeviceTabs";
const DEVICE_HEARTBEAT_MS = 60 * 1000;
const DEVICE_TAB_STALE_MS = 10 * 60 * 1000;

function readActiveDeviceTabs() {
  try {
    const tabs = JSON.parse(localStorage.getItem(DEVICE_TAB_STORAGE_KEY) || "{}");
    return tabs && typeof tabs === "object" ? tabs : {};
  } catch {
    return {};
  }
}

function writeActiveDeviceTabs(tabs) {
  localStorage.setItem(DEVICE_TAB_STORAGE_KEY, JSON.stringify(tabs));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const tabId = useRef(
    globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const hasToken = useCallback(() => Boolean(localStorage.getItem("accessToken")), []);

  const reloadMe = useCallback(async () => {
    if (!hasToken()) {
      setUser(null);
      return null;
    }

    try {
      const me = await apiFetch("/accounts/users/me/");
      setUser(me);
      return me;
    } catch (error) {
      if (error?.status === 401) {
        await clearAuthTokens();
        setUser(null);
      } else if (
        error?.status === 403 &&
        error?.data?.code === "concurrent_session_limit"
      ) {
        await clearAuthTokens();
        setUser(null);
      }
      return null;
    } finally {
      // keep loading as a bootstrap-only flag
    }
  }, [hasToken]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuthentication() {
      await reloadMe();
      if (!cancelled) {
        setLoading(false);
      }
    }

    bootstrapAuthentication();
    return () => {
      cancelled = true;
    };
  }, [reloadMe]);

  useEffect(() => {
    function refreshVisibleSession() {
      if (document.visibilityState === "visible" && hasToken()) {
        reloadMe();
      }
    }

    const timer = window.setInterval(refreshVisibleSession, 300000);
    window.addEventListener("focus", refreshVisibleSession);
    document.addEventListener("visibilitychange", refreshVisibleSession);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleSession);
      document.removeEventListener("visibilitychange", refreshVisibleSession);
    };
  }, [hasToken, reloadMe]);

  useEffect(() => {
    if (!user || !hasToken()) {
      return undefined;
    }
    const currentTabId = tabId.current;

    function updateThisTab() {
      const now = Date.now();
      const tabs = readActiveDeviceTabs();
      for (const [id, lastSeenAt] of Object.entries(tabs)) {
        if (now - Number(lastSeenAt) > DEVICE_TAB_STALE_MS) {
          delete tabs[id];
        }
      }
      tabs[currentTabId] = now;
      writeActiveDeviceTabs(tabs);
    }

    function sendHeartbeat() {
      updateThisTab();
      heartbeatDeviceSession().catch(() => {});
    }

    function releaseIfLastTab() {
      const now = Date.now();
      const tabs = readActiveDeviceTabs();
      delete tabs[currentTabId];
      for (const [id, lastSeenAt] of Object.entries(tabs)) {
        if (now - Number(lastSeenAt) > DEVICE_TAB_STALE_MS) {
          delete tabs[id];
        }
      }
      writeActiveDeviceTabs(tabs);
      if (Object.keys(tabs).length === 0) {
        releaseDeviceSession();
      }
    }

    function heartbeatWhenVisible() {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
      }
    }

    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, DEVICE_HEARTBEAT_MS);
    window.addEventListener("pagehide", releaseIfLastTab);
    document.addEventListener("visibilitychange", heartbeatWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", releaseIfLastTab);
      document.removeEventListener("visibilitychange", heartbeatWhenVisible);
      const tabs = readActiveDeviceTabs();
      delete tabs[currentTabId];
      writeActiveDeviceTabs(tabs);
    };
  }, [hasToken, user]);

  const notifyLogin = useCallback(async () => {
    setLoading(true);
    try {
      return await reloadMe();
    } finally {
      setLoading(false);
    }
  }, [reloadMe]);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    reloadMe,
    notifyLogin,
    logout: () => {
      clearAuthTokens();
      setUser(null);
      setLoading(false);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
