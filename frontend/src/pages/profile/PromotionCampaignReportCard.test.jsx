import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PromotionCampaignReportCard from "./PromotionCampaignReportCard.jsx";

const mocks = vi.hoisted(() => ({
  fetchPromotionCampaigns: vi.fn(),
  fetchPromotionCampaignReport: vi.fn(),
}));

vi.mock("../../api/auth/profile.js", () => ({
  fetchPromotionCampaigns: mocks.fetchPromotionCampaigns,
  fetchPromotionCampaignReport: mocks.fetchPromotionCampaignReport,
}));

const report = {
  campaign_name: "花虫二",
  month: "2026-10",
  coupon_redemptions: 11,
  redeeming_users: 9,
  paid_orders: 1,
  paying_users: 1,
  original_amount: "39.90",
  promotion_discount: "5.00",
  final_amount: "34.90",
  purchases: [{
    promotion_code: "HUACHONG01",
    telephone: "13800138000",
    offer_code: "science-season-lifetime",
    offer_title: "科普季永久权限",
    merchant_order_no: "profile-report-order",
    original_amount: "39.90",
    promotion_discount: "5.00",
    final_amount: "34.90",
    applied_at: "2026-10-15T12:00:00Z",
  }],
};

describe("PromotionCampaignReportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPromotionCampaigns.mockResolvedValue({
      campaigns: ["昆仑字幕组", "花虫二", "花虫二-十月"],
    });
    mocks.fetchPromotionCampaignReport.mockResolvedValue(report);
  });

  it("shows all campaigns and filters them by contained text", async () => {
    render(<PromotionCampaignReportCard />);
    const input = screen.getByRole("combobox", { name: "合作博主" });

    fireEvent.focus(input);
    expect(await screen.findByRole("option", { name: "昆仑字幕组" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "花虫二" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "花虫二-十月" })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "花虫" } });
    expect(screen.queryByRole("option", { name: "昆仑字幕组" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "花虫二-十月" }));
    expect(input).toHaveValue("花虫二-十月");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard selection and closing", async () => {
    render(<PromotionCampaignReportCard />);
    const input = screen.getByRole("combobox", { name: "合作博主" });

    fireEvent.focus(input);
    await screen.findByRole("option", { name: "昆仑字幕组" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("花虫二");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("queries all-time totals when all time is selected", async () => {
    render(<PromotionCampaignReportCard />);

    fireEvent.change(screen.getByLabelText("合作博主"), { target: { value: "花虫二" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "全部时间" }));
    expect(screen.getByLabelText("选择月份")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() => expect(mocks.fetchPromotionCampaignReport).toHaveBeenCalledWith({
      campaignName: "花虫二",
      month: "all",
    }));
  });

  it("queries one campaign keyword and month and renders summary and purchases", async () => {
    render(<PromotionCampaignReportCard />);

    fireEvent.change(screen.getByLabelText("合作博主"), { target: { value: "花虫二" } });
    fireEvent.change(screen.getByLabelText("选择月份"), { target: { value: "2026-10" } });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    await waitFor(() => expect(mocks.fetchPromotionCampaignReport).toHaveBeenCalledWith({
      campaignName: "花虫二",
      month: "2026-10",
    }));
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("科普季永久权限")).toBeInTheDocument();
    expect(screen.getByText("science-season-lifetime")).toBeInTheDocument();
    expect(screen.getByText("profile-report-order")).toBeInTheDocument();
    expect(screen.getAllByText("¥34.90").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "购买明细" })).toBeInTheDocument();
    expect(screen.getByText("1 笔")).toBeInTheDocument();
  });

  it("renders the empty result message", async () => {
    mocks.fetchPromotionCampaignReport.mockResolvedValueOnce({
      ...report,
      coupon_redemptions: 0,
      redeeming_users: 0,
      paid_orders: 0,
      paying_users: 0,
      original_amount: "0.00",
      promotion_discount: "0.00",
      final_amount: "0.00",
      purchases: [],
    });
    render(<PromotionCampaignReportCard />);

    fireEvent.change(screen.getByLabelText("合作博主"), { target: { value: "无人兑换" } });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("暂无兑换或购买记录")).toBeInTheDocument();
  });

  it("renders a functional error message", async () => {
    mocks.fetchPromotionCampaignReport.mockRejectedValueOnce({
      data: { detail: "暂无权限" },
    });
    render(<PromotionCampaignReportCard />);

    fireEvent.change(screen.getByLabelText("合作博主"), { target: { value: "花虫二" } });
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(await screen.findByText("暂无权限")).toBeInTheDocument();
  });
});
