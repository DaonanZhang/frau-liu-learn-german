// src/api/AuthProvider.jsx
import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext.jsx";
import { apiFetch } from "../client.js";
import { logout as clearAuthTokens } from "./index.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tokenPresent, setTokenPresent] = useState(
    () => Boolean(localStorage.getItem("accessToken"))
  );

  const hasToken = useCallback(() => Boolean(localStorage.getItem("accessToken")), []);

  const reloadMe = useCallback(async () => {
    if (!hasToken()) {
      setUser(null);
      setTokenPresent(false);
      return;
    }

    try {
      const me = await apiFetch("/accounts/users/me/");
      setUser(me);
      setTokenPresent(true);
    } catch {
      clearAuthTokens();
      setUser(null);
      setTokenPresent(false);
    } finally {
      // keep loading as a bootstrap-only flag
    }
  }, [hasToken]);

  useEffect(() => {
    const token = hasToken();
    setTokenPresent(token);
    setLoading(false);
    if (!user && token) {
      reloadMe();
    }
  }, [user, hasToken, reloadMe]);

  const notifyLogin = useCallback(() => {
    setTokenPresent(true);
    reloadMe();
  }, [reloadMe]);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user) || tokenPresent,
    reloadMe,
    notifyLogin,
    logout: () => {
      clearAuthTokens();
      setUser(null);
      setTokenPresent(false);
      setLoading(false);
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
