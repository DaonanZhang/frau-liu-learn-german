import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../client", () => ({ ApiError: class ApiError extends Error {}, apiFetch }));

import { redeemCode } from "./auth.js";

describe("redeemCode", () => {
  beforeEach(() => apiFetch.mockReset());

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
