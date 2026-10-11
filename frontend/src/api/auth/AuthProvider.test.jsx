import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  clearAuthTokens: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock("./index.js", () => ({
  clearDeviceActivityId: vi.fn(),
  getOrCreateDeviceActivityId: vi.fn(() => "activity-1"),
  heartbeatDeviceSession: vi.fn().mockResolvedValue(undefined),
  logout: authMocks.clearAuthTokens,
  releaseDeviceSession: vi.fn(),
}));

vi.mock("../client.js", () => ({
  apiFetch: authMocks.apiFetch,
}));

import { AuthProvider } from "./AuthProvider.jsx";
import { useAuth } from "./useAuth.js";

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

function renderAuthConsumer() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>,
  );
}

describe("AuthProvider logout", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    authMocks.clearAuthTokens.mockClear();
    authMocks.apiFetch.mockResolvedValue({ id: 1 });
    localStorage.setItem("accessToken", "access-token");
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
});
