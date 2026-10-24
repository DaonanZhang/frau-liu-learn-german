import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "./ProfilePage.jsx";

const profileStyles = readFileSync(resolve("src/pages/ProfilePage.css"), "utf8");


const mocks = vi.hoisted(() => ({
  fetchMyCoupons: vi.fn(),
  fetchReferralCampaign: vi.fn(),
  fetchMyProfile: vi.fn(),
  fetchPromotionCodeDetails: vi.fn(),
  fetchPromotionCodeHistory: vi.fn(),
  createPromotionCodes: vi.fn(),
  reloadMe: vi.fn(),
  updateMyProfile: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../api/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("../api/auth/profile.js", () => ({
  fetchMyProfile: mocks.fetchMyProfile,
  fetchPromotionCodeDetails: mocks.fetchPromotionCodeDetails,
  updateMyProfile: mocks.updateMyProfile,
  fetchPromotionCodeHistory: mocks.fetchPromotionCodeHistory,
  createPromotionCodes: mocks.createPromotionCodes,
}));
vi.mock("../api/coupons.js", () => ({ fetchMyCoupons: mocks.fetchMyCoupons }));
vi.mock("../api/referrals.js", () => ({ fetchReferralCampaign: mocks.fetchReferralCampaign }));

describe("ProfilePage coupon module picker", () => {
  beforeEach(() => {
    mocks.fetchReferralCampaign.mockResolvedValue({ enabled: false });
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
    mocks.createPromotionCodes.mockResolvedValue({
      partner_name: "春季批次",
      operator_name: "daonan",
      discount_amount: "5.00",
      count: 2,
      codes: ["CODE-1", "CODE-2"],
    });
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

  it("places the referral campaign panel before the coupon wallet", async () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);
    const panel = await screen.findByRole("region", { name: "推广活动" });
    const wallet = screen.getByRole("region", { name: "我的优惠券" });
    expect(panel.compareDocumentPosition(wallet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ProfilePage promotion code manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchReferralCampaign.mockResolvedValue({ enabled: false });
    mocks.createPromotionCodes.mockResolvedValue({
      partner_name: "于云",
      operator_name: "daonan",
      discount_amount: "5.00",
      count: 2,
      codes: ["CODE-1", "CODE-2"],
    });
    mocks.fetchPromotionCodeHistory.mockResolvedValue({
      results: [{
        generation_batch_id: "batch-1",
        operator_name: "daonan",
        partner_name: "于云",
        count: 50,
        discount_amount: "5.00",
        created_at: "2026-10-17T12:00:00Z",
      }],
      count: 1,
      page: 1,
      total_pages: 1,
    });
    mocks.fetchPromotionCodeDetails.mockResolvedValue({
      generation_batch_id: "batch-1",
      partner_name: "于云",
      operator_name: "daonan",
      count: 2,
      discount_amount: "5.00",
      codes: ["CODE-1", "CODE-2"],
    });
  });

  function renderProfile(isSuperuser = true, telephone = "110") {
    mocks.useAuth.mockReturnValue({
      user: { is_superuser: isSuperuser, telephone },
      reloadMe: mocks.reloadMe,
    });
    mocks.fetchMyProfile.mockResolvedValue({});
    mocks.fetchMyCoupons.mockResolvedValue([]);
    return render(<MemoryRouter><ProfilePage /></MemoryRouter>);
  }

  it("hides the generator from regular users", async () => {
    renderProfile(false);
    await screen.findByText("个人资料");
    expect(screen.queryByText("生成优惠码")).not.toBeInTheDocument();
    expect(mocks.fetchPromotionCodeHistory).not.toHaveBeenCalled();
  });

  it("allows superusers with other telephone numbers to manage codes", async () => {
    renderProfile(true, "13800138000");
    fireEvent.click(await screen.findByRole("tab", { name: "生成记录" }));
    expect(await screen.findByText("于云")).toBeInTheDocument();
    expect(mocks.fetchPromotionCodeHistory).toHaveBeenCalledWith({ search: "", page: 1 });
  });

  it("submits without an empty amount and copies generated codes", async () => {
    renderProfile();
    const partnerInput = await screen.findByLabelText("合作博主");
    expect(partnerInput).not.toHaveAttribute("placeholder");
    fireEvent.change(partnerInput, { target: { value: "于云" } });
    fireEvent.change(screen.getByLabelText("管理员"), { target: { value: "daonan" } });
    fireEvent.change(screen.getByLabelText("数量"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));
    await waitFor(() => expect(mocks.createPromotionCodes).toHaveBeenCalledWith({
      partner_name: "于云",
      operator_name: "daonan",
      count: 2,
    }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "优惠码列表" })).toHaveValue("CODE-1\nCODE-2");
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    fireEvent.click(screen.getByRole("button", { name: "复制全部" }));
    expect(await screen.findByText("已复制全部优惠码。" )).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("CODE-1\nCODE-2");
  });

  it("loads history codes into the shared modal", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("tab", { name: "生成记录" }));
    fireEvent.click(await screen.findByRole("button", { name: /于云/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mocks.fetchPromotionCodeDetails).toHaveBeenCalledWith("batch-1");
    expect(screen.getByRole("textbox", { name: "优惠码列表" })).toHaveValue("CODE-1\nCODE-2");
    expect(within(screen.getByRole("dialog")).queryByText("daonan")).not.toBeInTheDocument();
    expect(screen.getByText("daonan 添加了 50 个优惠码")).toBeInTheDocument();
  });

  it("shows history detail errors without opening the modal", async () => {
    mocks.fetchPromotionCodeDetails.mockRejectedValueOnce({ data: { detail: "详情不可用" } });
    renderProfile();
    fireEvent.click(await screen.findByRole("tab", { name: "生成记录" }));
    fireEvent.click(await screen.findByRole("button", { name: /于云/ }));
    expect(await screen.findByText("详情不可用")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the promotion modal with the close button and Escape", async () => {
    renderProfile();
    fireEvent.change(await screen.findByLabelText("合作博主"), { target: { value: "于云" } });
    fireEvent.change(screen.getByLabelText("管理员"), { target: { value: "daonan" } });
    fireEvent.change(screen.getByLabelText("数量"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends a custom amount and shows API errors", async () => {
    mocks.createPromotionCodes.mockRejectedValueOnce({ data: { detail: "生成失败" } });
    renderProfile();
    fireEvent.change(await screen.findByLabelText("合作博主"), { target: { value: "旧博主" } });
    fireEvent.change(screen.getByLabelText("管理员"), { target: { value: "Anna" } });
    fireEvent.change(screen.getByLabelText("数量"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("优惠金额"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));
    await waitFor(() => expect(mocks.createPromotionCodes).toHaveBeenCalledWith({
      partner_name: "旧博主",
      operator_name: "Anna",
      count: 8,
      discount_amount: "8",
    }));
    expect(await screen.findByText("生成失败")).toBeInTheDocument();
  });

  it("loads generation history in the second tab", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("tab", { name: "生成记录" }));

    expect(await screen.findByText("于云")).toBeInTheDocument();
    expect(screen.getByText("daonan 添加了 50 个优惠码")).toBeInTheDocument();
    expect(mocks.fetchPromotionCodeHistory).toHaveBeenCalledWith({ search: "", page: 1 });
  });

  it("searches history from the first page", async () => {
    renderProfile();
    fireEvent.click(await screen.findByRole("tab", { name: "生成记录" }));
    const search = await screen.findByLabelText("搜索合作博主或管理员");
    fireEvent.change(search, { target: { value: "  Anna  " } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(mocks.fetchPromotionCodeHistory).toHaveBeenLastCalledWith({ search: "Anna", page: 1 }));
    expect(screen.getByText("于云")).toBeInTheDocument();
  });

  it("paginates history and disables the boundary buttons", async () => {
    mocks.fetchPromotionCodeHistory
      .mockResolvedValueOnce({ results: [{ generation_batch_id: "batch-1", partner_name: "第一页", operator_name: "daonan", count: 20, created_at: "2026-10-17T12:00:00Z" }], count: 21, page: 1, total_pages: 2 })
      .mockResolvedValueOnce({ results: [{ generation_batch_id: "batch-2", partner_name: "第二页", operator_name: "daonan", count: 1, created_at: "2026-10-17T12:00:00Z" }], count: 21, page: 2, total_pages: 2 });
    renderProfile();
    fireEvent.click(await screen.findByRole("tab", { name: "生成记录" }));
    expect(await screen.findByText("第一页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(await screen.findByText("第二页")).toBeInTheDocument();
    expect(mocks.fetchPromotionCodeHistory).toHaveBeenLastCalledWith({ search: "", page: 2 });
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一页" })).not.toBeDisabled();
  });
});

describe("ProfilePage phone country selector", () => {
  it("reserves extra right padding for the native dropdown arrow", () => {
    expect(profileStyles).toMatch(/\.profile-select\s*\{[^}]*padding-right:\s*2rem/);
    expect(profileStyles).toMatch(/\.profile-select\s*\{[^}]*appearance:\s*none/);
    expect(profileStyles).toMatch(/\.profile-select\s*\{[^}]*background-position:/);
    expect(profileStyles).toMatch(/\.profile-input--readonly\s*\{[^}]*background-color:/);
  });
});
