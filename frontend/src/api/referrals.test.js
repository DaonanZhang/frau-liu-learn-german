import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./client.js", () => ({ apiFetch }));

import { acknowledgeReferralNotice, fetchReferralCampaign, fetchUnreadReferralNotices } from "./referrals.js";

describe("referral API", () => {
  beforeEach(() => apiFetch.mockReset());

  it("fetches the referral campaign snapshot", async () => {
    await fetchReferralCampaign();
    expect(apiFetch).toHaveBeenCalledWith("/accounts/referral-campaign/");
  });

  it("fetches unread referral notices as an array", async () => {
    apiFetch.mockResolvedValue([]);
    expect(await fetchUnreadReferralNotices()).toEqual([]);
    expect(apiFetch).toHaveBeenCalledWith("/accounts/referral-notices/unread/");
  });

  it("acknowledges a referral notice with POST", async () => {
    await acknowledgeReferralNotice(17);
    expect(apiFetch).toHaveBeenCalledWith("/accounts/referral-notices/17/acknowledge/", { method: "POST" });
  });
});
