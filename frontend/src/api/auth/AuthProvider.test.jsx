import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  clearAuthTokens: vi.fn(),
  apiFetch: vi.fn(),
  heartbeatDeviceSession: vi.fn(),
  isDeviceSessionExpired: vi.fn(),
  recoverDeviceSession: vi.fn(),
  resetDeviceSessionExpiry: vi.fn(),
  subscribeToDeviceSessionExpiry: vi.fn(),
}));

vi.mock("./index.js", () => ({
  clearDeviceActivityId: vi.fn(),
  getOrCreateDeviceActivityId: vi.fn(() => "activity-1"),
  heartbeatDeviceSession: authMocks.heartbeatDeviceSession,
  isDeviceSessionExpired: authMocks.isDeviceSessionExpired,
  logout: authMocks.clearAuthTokens,
  recoverDeviceSession: authMocks.recoverDeviceSession,
  releaseDeviceSession: vi.fn(),
  resetDeviceSessionExpiry: authMocks.resetDeviceSessionExpiry,
  subscribeToDeviceSessionExpiry: authMocks.subscribeToDeviceSessionExpiry,
}));

vi.mock("../client.js", () => ({
  apiFetch: authMocks.apiFetch,
}));

import { AuthProvider } from "./AuthProvider.jsx";
import { useAuth } from "./useAuth.js";

let expiryListener = null;

function AuthConsumer() {
  const { loading, logout, user } = useAuth();

  return (
    <>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? "authenticated" : "signed-out"}</span>
      <button type="button" onClick={logout}>Logout</button>
    </>
  );
}

function renderAuthConsumer(providerProps = {}) {
  return render(
    <AuthProvider {...providerProps}>
      <AuthConsumer />
    </AuthProvider>,
  );
}

describe("AuthProvider logout", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    expiryListener = null;
    Object.values(authMocks).forEach((mock) => mock.mockReset());
    authMocks.clearAuthTokens.mockImplementation(async () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
    });
    authMocks.apiFetch.mockResolvedValue({ id: 1 });
    authMocks.heartbeatDeviceSession.mockResolvedValue(undefined);
    authMocks.isDeviceSessionExpired.mockReturnValue(false);
    authMocks.recoverDeviceSession.mockResolvedValue(undefined);
    authMocks.subscribeToDeviceSessionExpiry.mockImplementation((listener) => {
      expiryListener = listener;
      return vi.fn();
    });
    localStorage.setItem("accessToken", "access-token");
    localStorage.setItem("refreshToken", "refresh-token");
  });

  it("clears exam annotation sessions while preserving unrelated storage", async () => {
    sessionStorage.setItem("exam-annotations:v1:exercise:reading:1", "exercise");
    sessionStorage.setItem("exam-annotations:v1:mock:attempt-1", "mock");
    sessionStorage.setItem("unrelated-session", "keep-session");
    localStorage.setItem("unrelated-local", "keep-local");

    renderAuthConsumer();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("authenticated"));

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(authMocks.clearAuthTokens).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("exam-annotations:v1:exercise:reading:1")).toBeNull();
    expect(sessionStorage.getItem("exam-annotations:v1:mock:attempt-1")).toBeNull();
    expect(sessionStorage.getItem("unrelated-session")).toBe("keep-session");
    expect(localStorage.getItem("unrelated-local")).toBe("keep-local");
    expect(screen.getByTestId("user")).toHaveTextContent("signed-out");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("does not block logout when annotation storage access throws", async () => {
    const keySpy = vi.spyOn(sessionStorage, "key").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    renderAuthConsumer();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("authenticated"));

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(authMocks.clearAuthTokens).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user")).toHaveTextContent("signed-out");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    keySpy.mockRestore();
  });

  it("shows one fallback dialog when device session recovery reaches terminal failure", async () => {
    renderAuthConsumer();
    await waitFor(() => expect(expiryListener).toBeTypeOf("function"));

    act(() => {
      expiryListener({ status: 403, data: { code: "concurrent_session_limit" } });
      expiryListener({ status: 403, data: { code: "concurrent_session_limit" } });
    });

    const dialogs = screen.getAllByRole("dialog", { name: "登录会话已过期" });
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveTextContent("您的登录会话已过期，请退出后重新登录");
    expect(screen.getByRole("button", { name: "重新登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
  });

  it("reloads from the fallback dialog without clearing tokens", async () => {
    const reloadPage = vi.fn();
    renderAuthConsumer({ reloadPage });
    await waitFor(() => expect(expiryListener).toBeTypeOf("function"));
    act(() => expiryListener({ status: 409, data: { code: "device_activity_closed" } }));

    fireEvent.click(screen.getByRole("button", { name: "重新登录" }));

    expect(reloadPage).toHaveBeenCalledOnce();
    expect(authMocks.clearAuthTokens).not.toHaveBeenCalled();
  });

  it("clears authentication before navigating to login from the fallback dialog", async () => {
    const navigateToLogin = vi.fn();
    authMocks.clearAuthTokens.mockImplementation(() => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      return new Promise(() => {});
    });
    renderAuthConsumer({ navigateToLogin });
    await waitFor(() => expect(expiryListener).toBeTypeOf("function"));
    act(() => expiryListener({ status: 403, data: { code: "concurrent_session_limit" } }));

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(navigateToLogin).toHaveBeenCalledOnce());
    expect(authMocks.clearAuthTokens).toHaveBeenCalledOnce();
    expect(authMocks.clearAuthTokens.mock.invocationCallOrder[0])
      .toBeLessThan(navigateToLogin.mock.invocationCallOrder[0]);
    expect(authMocks.resetDeviceSessionExpiry).toHaveBeenCalledOnce();
  });

  it("does not show the fallback dialog for an ordinary heartbeat network failure", async () => {
    authMocks.recoverDeviceSession.mockRejectedValue(new TypeError("offline"));

    renderAuthConsumer();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.queryByRole("dialog", { name: "登录会话已过期" })).not.toBeInTheDocument();
  });
});
