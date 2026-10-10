import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "./ProfilePage.jsx";


const mocks = vi.hoisted(() => ({
  fetchMyCoupons: vi.fn(),
  fetchMyProfile: vi.fn(),
  reloadMe: vi.fn(),
  updateMyProfile: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../api/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../api/auth/profile.js", () => ({
  fetchMyProfile: mocks.fetchMyProfile,
  updateMyProfile: mocks.updateMyProfile,
}));
vi.mock("../api/coupons.js", () => ({ fetchMyCoupons: mocks.fetchMyCoupons }));

describe("ProfilePage coupon module picker", () => {
  beforeEach(() => {
    const user = {
      country_code: "+86",
      telephone: "13800138000",
      username: "测试用户",
      email: "buyer@example.com",
      is_staff: false,
      is_superuser: false,
      entitlements: [{
        id: 41,
        status: "active",
        starts_at: "2026-01-01T00:00:00Z",
        expires_at: null,
        module: { key: "learning_by_video", name: "视频学习" },
        season: { season_number: 4, title: "Vlog季" },
      }],
    };
    mocks.useAuth.mockReturnValue({ user, reloadMe: mocks.reloadMe });
    mocks.fetchMyProfile.mockResolvedValue(user);
    mocks.fetchMyCoupons.mockResolvedValue([{
      id: 20,
      display_name: "昆仑字幕组专属优惠券",
      discount_amount: "5.00",
      minimum_order_amount: "0.00",
      status: "available",
      effective_status: "available",
      expires_at: null,
      scope: {},
      usage_history: [],
    }]);
  });

  it("hides a module the user already owns from the coupon use picker", async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("昆仑字幕组专属优惠券")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "去使用" }));

    expect(screen.queryByRole("button", { name: /Vlog季/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /科普季/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /备考季/ })).toBeInTheDocument();
  });
});
