// src/api/AuthProvider.jsx
import { useCallback, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext.jsx";
import { apiFetch } from "../client.js";
import { logout as clearAuthTokens } from "./index.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const hasToken = () => Boolean(localStorage.getItem("accessToken"));

  const reloadMe = useCallback(async () => {
    if (!hasToken()) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await apiFetch("/accounts/users/me/");
      setUser(me);
    } catch {
      clearAuthTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user && hasToken()) {
      reloadMe();
    } else {
      setLoading(false);
    }
  }, [user, reloadMe]);

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    reloadMe,
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
