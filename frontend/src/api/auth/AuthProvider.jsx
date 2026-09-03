// src/api/AuthProvider.jsx
import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext.jsx";
import { apiFetch } from "../client.js";
import { logout as clearAuthTokens } from "./index.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
        clearAuthTokens();
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
