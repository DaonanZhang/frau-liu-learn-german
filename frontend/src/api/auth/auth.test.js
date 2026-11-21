import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, swalFire } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  swalFire: vi.fn(),
}));
vi.mock("../client", () => ({ ApiError: class ApiError extends Error {}, apiFetch }));
vi.mock("sweetalert2", () => ({ default: { fire: swalFire } }));

import { login, redeemCode, requestPhoneRecovery } from "./auth.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("redeemCode", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    swalFire.mockReset().mockResolvedValue({});
  });

  it("trims the code and sends confirm_replace as a boolean", async () => {
    apiFetch.mockResolvedValue({ type: "promotion", coupon: { id: 1 } });

    await redeemCode("  SAVE10  ", { confirmReplace: true });

    expect(apiFetch).toHaveBeenCalledWith("/accounts/auth/redeem-code/", {
      method: "POST",
      body: { code: "SAVE10", confirm_replace: true },
    });
  });

  it("defaults confirm_replace to false", async () => {
    await redeemCode("CODE");
    expect(apiFetch).toHaveBeenCalledWith("/accounts/auth/redeem-code/", {
      method: "POST",
      body: { code: "CODE", confirm_replace: false },
    });
  });
});

describe("login error messages", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    swalFire.mockReset().mockResolvedValue({});
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["account_not_found", "手机号不存在。"],
    ["invalid_password", "密码错误。"],
  ])("presents %s distinctly", async (code, message) => {
    apiFetch.mockRejectedValue({ data: { code, detail: message } });

    await login("13800138000", "wrong", "+86");

    expect(swalFire).toHaveBeenCalledWith({
      icon: "error",
      title: "登录失败",
      text: message,
    });
  });
});

describe("requestPhoneRecovery", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    swalFire.mockReset().mockResolvedValue({});
  });

  it("posts the bound email to the recovery endpoint", async () => {
    apiFetch.mockResolvedValue({ detail: "已发送" });

    const result = await requestPhoneRecovery("learner@example.com");

    expect(apiFetch).toHaveBeenCalledWith("/accounts/auth/phone-recovery/request/", {
      method: "POST",
      body: { email: "learner@example.com" },
    });
    expect(result.ok).toBe(true);
    expect(swalFire).not.toHaveBeenCalled();
  });

  it("keeps the failure alert", async () => {
    apiFetch.mockRejectedValue({ data: { detail: "请稍后再试。" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requestPhoneRecovery("learner@example.com");

    expect(result.ok).toBe(false);
    expect(swalFire).toHaveBeenCalledWith({
      icon: "error",
      title: "暂时无法发送",
      text: "请稍后再试。",
    });
  });
});
