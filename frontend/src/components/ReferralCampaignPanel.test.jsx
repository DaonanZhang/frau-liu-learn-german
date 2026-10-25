import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchReferralCampaign } = vi.hoisted(() => ({ fetchReferralCampaign: vi.fn() }));
vi.mock("../api/referrals.js", () => ({ fetchReferralCampaign }));

import ReferralCampaignPanel from "./ReferralCampaignPanel.jsx";

const panelStyles = readFileSync(resolve("src/components/ReferralCampaignPanel.css"), "utf8");

function renderPanel() {
  return render(<MemoryRouter><ReferralCampaignPanel /></MemoryRouter>);
}

function snapshot(overrides = {}) {
  return {
    enabled: true, eligible: true, locked: false, campaign: { name: "秋季推广", tag: "autumn" }, code: "ABC123",
    effective_count: 0, nodes: [], milestones: { science_3: { status: "not_earned" }, vlog_5: { status: "not_earned" } }, history: [], ...overrides,
  };
}

beforeEach(() => {
  fetchReferralCampaign.mockReset();
});

describe("ReferralCampaignPanel", () => {
  it("loads independently and retries failures", async () => {
    fetchReferralCampaign.mockRejectedValueOnce(new Error()).mockResolvedValue(snapshot());
    renderPanel();
    expect(screen.getByText(/加载/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByText("ABC123")).toBeInTheDocument();
  });

  it("never renders a fabricated code for malformed data", async () => {
    fetchReferralCampaign.mockResolvedValue({ enabled: true, eligible: true, locked: false, campaign: null, code: "", nodes: null, milestones: null, history: null });
    renderPanel();
    expect(await screen.findByText(/暂不可用/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /复制/ })).not.toBeInTheDocument();
  });

  it("renders the locked comic banner and navigates directly to the existing purchase page", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ eligible: false, locked: true, code: "SHOULD-NOT-LEAK" }));
    const LocationProbe = () => <output>{useLocation().pathname}</output>;
    render(<MemoryRouter><ReferralCampaignPanel /><LocationProbe /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "暂未解锁推广系统" })).toBeInTheDocument();
    expect(screen.getByText("获得备考季权限后即可解锁推广系统。")).toBeInTheDocument();
    expect(screen.queryByText("推广活动")).not.toBeInTheDocument();
    expect(screen.queryByText("SHOULD-NOT-LEAK")).not.toBeInTheDocument();
    expect(document.querySelector(".referral-panel__locked-student")).toHaveAttribute("src", "/images/exam-referral/locked-student.png");
    expect(document.querySelector(".referral-panel__locked-books")).toHaveAttribute("src", "/images/exam-referral/locked-books.png");
    expect(document.querySelector("img[src*='visual-reference-only']")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "解锁备考季" }));
    expect(await screen.findByText("/modules/exam-preparation/purchase")).toBeInTheDocument();
  });

  it("does not present disabled activity as a purchase lock", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ enabled: false }));
    renderPanel();
    expect(await screen.findByText("活动暂未开放")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /解锁/ })).not.toBeInTheDocument();
  });

  it.each([0, 3, 5, 12])("renders %i true referrals across six accessible progress nodes", async (count) => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: count, milestones: { science_3: { status: count >= 3 ? "earned" : "not_earned", generation: 1 }, vlog_5: { status: count >= 5 ? "earned" : "not_earned", generation: 1 } } }));
    renderPanel();
    expect(await screen.findByRole("button", { name: /节点 1/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /节点/ })).toHaveLength(6);
    expect(document.querySelectorAll(".referral-panel__node--milestone")).toHaveLength(2);
    expect(document.querySelectorAll(".referral-panel__node.is-complete")).toHaveLength(Math.min(count, 6));
    expect(screen.getAllByRole("button", { name: /节点/ })[5]).toHaveAttribute("aria-label", expect.stringContaining("后续"));
    expect(screen.queryByText(/已成功推广 .* 人/)).not.toBeInTheDocument();
    expect(screen.queryByText(/每成功推广 1 人，备考季 \+30 天/)).not.toBeInTheDocument();
    expect(screen.queryByText(/奖励自动发放/)).not.toBeInTheDocument();
    expect(screen.queryByText(/永久权限或/)).not.toBeInTheDocument();
  });

  it.each([[0, 0], [3, 2], [5, 4], [6, 5]])("maps %i referrals to continuous line fill step %i", async (count, completedConnections) => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: count }));
    renderPanel();
    await screen.findByRole("button", { name: /节点 1/ });
    expect(document.querySelector(".referral-panel__track-line")).toBeInTheDocument();
    expect(document.querySelector(".referral-panel__track-fill")).toHaveClass(`referral-panel__track-fill--${completedConnections}`);
  });

  it("renders the real promotion code as an invitation ticket with both actions", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ code: "BK1-TLPEHL37W" }));
    renderPanel();
    expect(await screen.findByText("我的专属推广码")).toBeInTheDocument();
    expect(screen.getByText("BK1-TLPEHL37W").tagName).toBe("CODE");
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "邀请好友" })).toBeInTheDocument();
    expect(document.querySelector(".referral-panel__code-ticket svg")).toBeInTheDocument();
  });

  it("selects the first reward by default even before the first referral", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 0 }));
    renderPanel();
    const nodeOne = await screen.findByRole("button", { name: "节点 1：未完成" });
    expect(nodeOne).toHaveAttribute("aria-expanded", "true");
    expect(nodeOne).toHaveAttribute("aria-current", "step");
    expect(nodeOne).not.toHaveClass("is-complete");
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
  });

  it("shows a persistent shared reward card after clicking or using keyboard on a node", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 3, milestones: { science_3: { status: "earned" }, vlog_5: { status: "not_earned" } } }));
    renderPanel();
    const nodeThree = await screen.findByRole("button", { name: /节点 3/ });
    fireEvent.click(nodeThree);
    expect(nodeThree).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "节点 3 奖励详情" })).toHaveTextContent("赠送科普季");
    expect(screen.getByRole("img", { name: "备考季 +30 天漫画奖励" })).toHaveAttribute("src", "/images/exam-referral/reward_30_days.png");
    expect(screen.getByRole("img", { name: "科普季" })).toHaveAttribute("src", "/images/1.png");
    expect(screen.getByRole("region", { name: "节点 3 奖励详情" })).not.toHaveTextContent("未达成");
    fireEvent.click(nodeThree);
    expect(nodeThree).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "节点 3 奖励详情" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /节点 5/ }));
    expect(screen.getByRole("region", { name: "节点 5 奖励详情" })).toHaveTextContent("赠送 Vlog 季");
    expect(screen.getByRole("img", { name: "Vlog 季" })).toHaveAttribute("src", "/images/2.png");
  });

  it("renders a CSS-native circular node and the supplied reward illustration", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 3 }));
    renderPanel();
    const nodeThree = await screen.findByRole("button", { name: /节点 3/ });
    expect(nodeThree.querySelector("img")).not.toBeInTheDocument();
    expect(nodeThree.querySelector(".referral-panel__node-label")).toHaveTextContent("3");
    fireEvent.click(nodeThree);
    expect(screen.getByRole("img", { name: "备考季 +30 天漫画奖励" })).toHaveAttribute("src", "/images/exam-referral/reward_30_days.png");
  });

  it("marks completed nodes with a non-color completion indicator", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 2 }));
    renderPanel();
    const completedNode = await screen.findByRole("button", { name: /节点 1.*已完成/ });
    expect(completedNode).toHaveAttribute("aria-label", expect.stringContaining("已完成"));
    expect(completedNode.querySelector(".referral-panel__completion-mark")).toHaveTextContent("✓");
    expect(completedNode).toHaveAccessibleName("节点 1：已完成");
  });

  it("keeps the selected reward card open after Escape and outside pointer interaction", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot());
    renderPanel();
    const nodeOne = await screen.findByRole("button", { name: /节点 1/ });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body, { pointerType: "mouse" });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
    expect(nodeOne).toHaveAttribute("aria-expanded", "true");
  });

  it("shows repeat count in the follow-up reward card after five referrals", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 8 }));
    renderPanel();
    const followUpNode = await screen.findByRole("button", { name: /后续/ });
    expect(followUpNode).toHaveAccessibleName("后续节点：已完成");
    fireEvent.click(followUpNode);
    expect(screen.getByRole("region", { name: "后续奖励详情" })).toHaveTextContent("已获得后续奖励 3 次");
  });

  it("previews cards on focus and fine-pointer hover without replacing the clicked selection", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: true }) });
    fetchReferralCampaign.mockResolvedValue(snapshot());
    renderPanel();
    const nodeOne = await screen.findByRole("button", { name: /节点 1/ });
    const nodeTwo = screen.getByRole("button", { name: /节点 2/ });
    fireEvent.click(nodeOne);
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toHaveTextContent("备考季 +30 天");
    expect(screen.getByRole("img", { name: "备考季 +30 天漫画奖励" })).toHaveAttribute("src", "/images/exam-referral/reward_30_days.png");
    fireEvent.focus(nodeTwo);
    expect(screen.getByRole("region", { name: "节点 2 奖励详情" })).toBeInTheDocument();
    expect(nodeTwo).toHaveAttribute("aria-expanded", "true");
    expect(nodeOne).toHaveAttribute("aria-expanded", "false");
    fireEvent.blur(nodeTwo);
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
    expect(nodeOne).toHaveAttribute("aria-expanded", "true");
    expect(nodeTwo).toHaveAttribute("aria-expanded", "false");
    fireEvent.pointerEnter(nodeTwo, { pointerType: "mouse" });
    expect(screen.getByRole("region", { name: "节点 2 奖励详情" })).toBeInTheDocument();
    expect(nodeTwo).toHaveAttribute("aria-expanded", "true");
    expect(nodeOne).toHaveAttribute("aria-expanded", "false");
    fireEvent.pointerLeave(nodeTwo, { pointerType: "mouse" });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
    expect(nodeOne).toHaveAttribute("aria-expanded", "true");
    expect(nodeTwo).toHaveAttribute("aria-expanded", "false");
  });

  it("does not preview cards for coarse pointers", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false }) });
    fetchReferralCampaign.mockResolvedValue(snapshot());
    renderPanel();
    const nodeOne = await screen.findByRole("button", { name: /节点 1/ });
    const nodeTwo = screen.getByRole("button", { name: /节点 2/ });
    fireEvent.click(nodeOne);
    fireEvent.pointerEnter(nodeTwo, { pointerType: "touch" });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
  });

  it("previews a card while a touch pointer is held and restores after release or cancel", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false }) });
    fetchReferralCampaign.mockResolvedValue(snapshot());
    renderPanel();
    const nodeOne = await screen.findByRole("button", { name: /节点 1/ });
    const nodeTwo = screen.getByRole("button", { name: /节点 2/ });
    fireEvent.click(nodeOne);
    fireEvent.pointerDown(nodeTwo, { pointerType: "touch" });
    expect(screen.getByRole("region", { name: "节点 2 奖励详情" })).toBeInTheDocument();
    fireEvent.pointerCancel(nodeTwo, { pointerType: "touch" });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
    fireEvent.pointerDown(nodeTwo, { pointerType: "touch" });
    fireEvent.pointerUp(nodeTwo, { pointerType: "touch" });
    expect(screen.getByRole("region", { name: "节点 1 奖励详情" })).toBeInTheDocument();
  });

  it("renders active follow-up semantics for referrals after five", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 6 }));
    renderPanel();
    const followUpNode = await screen.findByRole("button", { name: /后续/ });
    expect(followUpNode).toHaveAttribute("aria-label", expect.stringContaining("已完成"));
    fireEvent.click(followUpNode);
    expect(screen.getByRole("region", { name: "后续奖励详情" })).toHaveTextContent("此后每推广一人");
    expect(screen.getByRole("img", { name: "备考季 +30 天漫画奖励" })).toHaveAttribute("src", "/images/exam-referral/reward_30_days.png");
  });

  it("shows milestone reward names without milestone status copy", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ milestones: { science_3: { status: "not_earned" }, vlog_5: { status: "earned" } } }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /节点 3/ }));
    expect(screen.getByRole("region", { name: "节点 3 奖励详情" })).toHaveTextContent("赠送科普季");
    expect(screen.queryByText("未达成")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /节点 5/ }));
    expect(screen.getByRole("region", { name: "节点 5 奖励详情" })).toHaveTextContent("赠送 Vlog 季");
    expect(screen.queryByText("已获得")).not.toBeInTheDocument();
  });

  it("copies, shares with fallback, and keeps referral history private", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 6, history: [
      { id: 1, event_type: "referral_qualified", payload: { days: 30, effective_count: 6, name: "PRIVATE NAME", order_no: "PRIVATE ORDER" }, created_at: null },
      { id: 2, event_type: "referral_milestone_granted", payload: { threshold: 3, kind: "science_3", reward_type: "entitlement", user: "PRIVATE NAME" }, created_at: "2026-01-01" },
      { id: 3, event_type: "referral_refunded", payload: { progress_removed: true, days_removed: 5, effective_count: 4, access_expires_at: "2026-01-31T00:00:00Z", milestone_changes: [
        { threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement", user: "PRIVATE NAME" },
        { threshold: 5, kind: "vlog_5", outcome: "revocation_pending", reward_type: "coupon" },
      ], order_no: "PRIVATE ORDER" }, created_at: "2026-01-02" },
      { id: 4, event_type: "referral_milestone_granted", payload: { threshold: 5, kind: "vlog_5", reward_type: "coupon" }, created_at: "2026-01-03" },
      { id: 5, event_type: "referral_refunded", payload: { effective_count: 2, milestone_changes: [
        { threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "coupon" },
      ] }, created_at: "2026-01-04" },
      { id: 6, event_type: "referral_refunded", payload: { effective_count: 1, milestone_changes: [
        { threshold: 5, kind: "vlog_5", outcome: "non_reversible", reward_type: "coupon" },
      ] }, created_at: "2026-01-05" },
      { id: 7, event_type: "referral_refunded", payload: { effective_count: 0, milestone_changes: [
        { threshold: 3, kind: "science_3", outcome: "unknown_outcome", reward_type: "entitlement", secret: "PRIVATE CHANGE" },
      ] }, created_at: "2026-01-06" },
    ] }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "复制" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABC123"));
    expect(screen.getByRole("status")).toHaveTextContent(/已复制/);
    expect(screen.queryByText("每成功推广 1 人，备考季 +30 天")).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE NAME/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE ORDER/)).not.toBeInTheDocument();
    const history = within(screen.getByRole("list", { name: "推广记录" }));
    expect(history.getByText(/备考季 \+30 天/)).toBeInTheDocument();
    expect(history.getByText(/当前有效推广人数：6/)).toBeInTheDocument();
    expect(history.getByText("已达成 3 人里程碑，科普季永久权限已自动发放")).toBeInTheDocument();
    expect(history.getByText("已达成 5 人里程碑，Vlog 季¥10 替代券已自动发放")).toBeInTheDocument();
    expect(history.getByText(/推广进度已回退.*5 天.*2026/)).toBeInTheDocument();
    expect(history.getByText(/当前有效推广人数：4/)).toBeInTheDocument();
    expect(history.getByText(/科普季永久权限已撤销/)).toBeInTheDocument();
    expect(history.getByText(/Vlog 季.*订单中.*订单结束/)).toBeInTheDocument();
    expect(history.getByText(/未使用的科普季 ¥10 替代券已撤销/)).toBeInTheDocument();
    expect(history.getByText(/Vlog 季 ¥10 替代券已使用，无法追回.*里程碑已兑现/)).toBeInTheDocument();
    expect(history.queryByText(/PRIVATE CHANGE|unknown_outcome|PRIVATE NAME|PRIVATE ORDER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/奖励自动发放/)).not.toBeInTheDocument();
    expect(screen.queryByText(/徽章|推广达人|佩戴|领取/)).not.toBeInTheDocument();
  });

  it("renders only recognized refund milestone outcomes from safe fields", async () => {
    const refundNotice = (id, change) => ({
      id, event_type: "referral_refunded", created_at: "2026-02-01T00:00:00Z",
      payload: { effective_count: 0, milestone_changes: [change], private_order: "ORDER SECRET" },
    });
    fetchReferralCampaign.mockResolvedValue(snapshot({ history: [
      refundNotice(11, { threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement" }),
      refundNotice(12, { threshold: 5, kind: "vlog_5", outcome: "revoked", reward_type: "coupon" }),
      refundNotice(13, { threshold: 3, kind: "science_3", outcome: "revocation_pending", reward_type: "coupon" }),
      refundNotice(14, { threshold: 5, kind: "vlog_5", outcome: "non_reversible", reward_type: "coupon" }),
      refundNotice(15, { threshold: 3, kind: "science_3", outcome: "unknown", reward_type: "entitlement", private: "CHANGE SECRET" }),
      refundNotice(16, { threshold: 3, kind: "vlog_5", outcome: "revoked", reward_type: "coupon" }),
    ] }));
    renderPanel();
    const history = within(await screen.findByRole("list", { name: "推广记录" }));
    expect(history.getByText(/科普季永久权限已撤销/)).toBeInTheDocument();
    expect(history.getByText(/未使用的Vlog 季 ¥10 替代券已撤销/)).toBeInTheDocument();
    expect(history.getByText(/科普季 ¥10 替代券正在订单中，待订单结束后处理/)).toBeInTheDocument();
    expect(history.getByText(/Vlog 季 ¥10 替代券已使用，无法追回，该里程碑已兑现/)).toBeInTheDocument();
    expect(history.queryByText(/CHANGE SECRET|ORDER SECRET|unknown/)).not.toBeInTheDocument();
    expect(history.queryByText(/Vlog 季永久权限已撤销/)).not.toBeInTheDocument();
  });

  it("uses native share and falls back to clipboard after a share failure", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot());
    const share = vi.fn().mockRejectedValue(new Error("unsupported"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "邀请好友" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("ABC123") })));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("ABC123")));
  });

  it("shares the campaign name and code natively", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot());
    const share = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "邀请好友" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "秋季推广", text: expect.stringContaining("秋季推广：使用我的推广码 ABC123"),
    })));
  });

  it("does not report a user-cancelled native share as an error", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot());
    Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue({ name: "AbortError" }) });
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "邀请好友" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps touch targets, responsive breakpoints, and motion rules explicit", () => {
    expect(panelStyles).toContain("@media (max-width: 768px)");
    expect(panelStyles).toContain("@media (max-width: 480px)");
    expect(panelStyles).toContain("min-height: 44px");
    expect(panelStyles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(panelStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(panelStyles).toMatch(/background:\s*#fff/);
    expect(panelStyles).toMatch(/grid-template-columns:\s*repeat\(6,/);
    expect(panelStyles).toContain(".referral-panel__track-line");
    expect(panelStyles).toContain("background: #e5e1f0");
    expect(panelStyles).toContain("background: #8d9de5");
    expect(panelStyles).toMatch(/border-radius:\s*50%/);
    expect(panelStyles).toMatch(/\.referral-panel__node\.is-complete::after\s*\{[^}]*border:\s*3px solid #69bf8d/s);
    expect(panelStyles).toMatch(/:focus-visible/);
    expect(panelStyles).toMatch(/position:\s*absolute/);
    expect(panelStyles).toMatch(/\.referral-panel--locked\s*\{[^}]*grid-template-columns:/s);
    expect(panelStyles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.referral-panel--locked\s*\{[^}]*flex-direction:\s*column/s);
    expect(panelStyles).toContain("#fffdf9");
    expect(panelStyles).toContain("#28243c");
    expect(panelStyles).toMatch(/\.referral-panel__reward-card\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(panelStyles).toMatch(/\.referral-panel__season-cover\s*\{[^}]*width:\s*min\(100%, 24rem\)/s);
    expect(panelStyles).not.toMatch(/transition:\s*all\b/);
    expect(panelStyles).toMatch(/@media \(hover: hover\) and \(pointer: fine\)\s*\{[^}]*\.referral-panel button:not\(\.referral-panel__node\):hover/s);
  });
});
