import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    enabled: true,
    eligible: true,
    locked: false,
    campaign: { name: "秋季推广", tag: "autumn" },
    code: "ABC123",
    effective_count: 0,
    history: [],
    ...overrides,
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

  it("does not render malformed campaign data", async () => {
    fetchReferralCampaign.mockResolvedValue({ enabled: true, eligible: true, locked: false, campaign: null, code: "", history: null });
    renderPanel();
    expect(await screen.findByText("推广信息暂不可用。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /复制/ })).not.toBeInTheDocument();
  });

  it("keeps disabled and locked states separate", async () => {
    fetchReferralCampaign.mockResolvedValueOnce(snapshot({ enabled: false }));
    const disabled = renderPanel();
    expect(await screen.findByText("活动暂未开放")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /解锁/ })).not.toBeInTheDocument();
    disabled.unmount();

    fetchReferralCampaign.mockResolvedValue(snapshot({ eligible: false, locked: true, code: "SHOULD-NOT-LEAK" }));
    const LocationProbe = () => <output>{useLocation().pathname}</output>;
    render(<MemoryRouter><ReferralCampaignPanel /><LocationProbe /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "解锁备考季" })).toBeInTheDocument();
    expect(screen.getByText("购买备考季后，即可获得专属推荐码并参与邀请奖励。")).toBeInTheDocument();
    expect(screen.queryByText("暂未解锁推广系统")).not.toBeInTheDocument();
    expect(screen.queryByText("推广活动")).not.toBeInTheDocument();
    expect(screen.queryByText("SHOULD-NOT-LEAK")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".referral-panel--locked img")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "解锁备考季" }));
    expect(await screen.findByText("/modules/exam-preparation/purchase")).toBeInTheDocument();
  });

  it.each([0, 3, 5, 12])("renders exactly six accessible progress nodes and the real count (%i)", async (count) => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: count }));
    renderPanel();
    expect(await screen.findByRole("heading", { name: "邀请好友，共享好课" })).toBeInTheDocument();
    expect(screen.getByText("邀请好友下单，双方均享丰富福利")).toBeInTheDocument();
    expect(screen.getByText("好友使用推荐码下单，立减 5 元")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "邀请进度与奖励" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: `${count} 位成功邀请用户` })).toBeInTheDocument();
    const progress = screen.getByRole("list", { name: `${count} 位成功邀请用户` });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(6);
    expect(document.querySelectorAll(".referral-panel__node")).toHaveLength(6);
    expect(document.querySelectorAll(".referral-panel__node--milestone")).toHaveLength(2);
    expect(document.querySelectorAll(".referral-panel__node--follow-up")).toHaveLength(1);
    const currentCount = document.querySelector(".referral-panel__current-count");
    const liveCount = currentCount.querySelector("[aria-live]");
    expect(liveCount).toHaveTextContent(`当前已成功邀请：${count} 人`);
    expect(liveCount).not.toHaveTextContent("赶快分享给好友，解锁丰厚备考福利吧！");
    expect(currentCount).toHaveTextContent("赶快分享给好友，解锁丰厚备考福利吧！");
    expect(screen.getByText("赶快分享给好友，解锁丰厚备考福利吧！")).toBeInTheDocument();
    expect(screen.getByText(String(count), { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("解锁科普季")).toBeInTheDocument();
    expect(screen.getByText("解锁 Vlog季")).toBeInTheDocument();
    expect(screen.getByText("每推荐 1 人成功下单备考季，您的备考季自动延长 1 个月（可叠加）。")).toBeInTheDocument();
    expect(screen.getByText("推荐达 3 人，额外赠送「科普季」权限。")).toBeInTheDocument();
    expect(screen.getByText("推荐达 5 人，额外再赠送「Vlog季」权限。")).toBeInTheDocument();
    expect(screen.getByText("奖励规则：")).toBeInTheDocument();
    expect(within(progress).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByRole("img", { name: /漫画奖励|科普季|Vlog 季/ })).not.toBeInTheDocument();
  });

  it.each([[0, "0%"], [1, "0%"], [3, "40%"], [5, "80%"], [6, "100%"], [12, "100%"]])("fills the progress line from effective_count (%i)", async (count, width) => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: count }));
    renderPanel();
    await screen.findByRole("heading", { name: "邀请进度与奖励" });
    expect(document.querySelector(".referral-panel__track-fill")).toHaveStyle({ width });
  });

  it.each([
    [0, 0, []],
    [1, 1, [1]],
    [2, 2, [1, 2]],
    [3, 3, [1, 2, 3]],
    [4, 4, [1, 2, 3, 4]],
    [5, 5, [1, 2, 3, 4, 5]],
    [12, 5, [1, 2, 3, 4, 5]],
  ])("shows completion markers for every completed numbered node (%i referrals)", async (count, markerCount, markedNodes) => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: count }));
    renderPanel();
    await screen.findByRole("heading", { name: "邀请进度与奖励" });
    const numberedNodes = [...document.querySelectorAll(".referral-panel__step:not(.referral-panel__step--follow-up) .referral-panel__node")];
    expect(document.querySelectorAll(".referral-panel__completion-mark")).toHaveLength(markerCount);
    markedNodes.forEach((node) => expect(numberedNodes[node - 1].querySelector(".referral-panel__completion-mark")).toBeInTheDocument());
    [1, 2, 3, 4, 5].filter((node) => !markedNodes.includes(node)).forEach((node) => expect(numberedNodes[node - 1].querySelector(".referral-panel__completion-mark")).not.toBeInTheDocument());
    expect(document.querySelector(".referral-panel__step--follow-up .referral-panel__completion-mark")).not.toBeInTheDocument();
  });

  it("shows and hides the follow-up tooltip for mouse, keyboard, and touch interactions", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ effective_count: 6 }));
    renderPanel();
    const followUp = await screen.findByRole("button", { name: "后续奖励：已完成" });
    const tooltip = document.getElementById("referral-follow-up-tooltip");
    expect(followUp).toHaveClass("referral-panel__node--follow-up", "is-complete");
    expect(followUp).toHaveAttribute("aria-describedby", "referral-follow-up-tooltip");
    expect(followUp).toHaveAttribute("aria-expanded", "false");
    expect(tooltip).toHaveAttribute("hidden");

    fireEvent.focus(followUp);
    expect(tooltip).not.toHaveAttribute("hidden");
    fireEvent.blur(followUp);
    expect(tooltip).toHaveAttribute("hidden");

    fireEvent.click(followUp);
    expect(tooltip).not.toHaveAttribute("hidden");
    expect(followUp).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the promotion code and both copy actions", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ code: "BK1-TLPEHL37W" }));
    renderPanel();
    expect(await screen.findByText("专属推荐码")).toBeInTheDocument();
    expect(screen.getByText("BK1-TLPEHL37W").tagName).toBe("CODE");
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一键复制完整文案" })).toBeInTheDocument();
    expect(screen.getByText("快速分享文案")).toBeInTheDocument();
  });

  it("copies the exact code and invitation text without opening native share", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ code: "  ABC123  " }));
    const share = vi.fn();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "复制" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABC123"));
    expect(screen.getByRole("button", { name: "复制，已复制" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键复制完整文案" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("强烈推荐大家试试【符号刘德语备考一站式平台】！\n🌐 网站：www.frauliu.com (中国IP) / www.frauliu.cn (海外IP)\n我正在用它高效复习备考！\n🎁 输入我的专属分享码: 【ABC123】 即刻享受立减 5 元的专属折扣！\n快来和我一起上岸吧！Viel Erfolg bei der Prüfung!"));
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "一键复制完整文案，已复制" })).toBeInTheDocument();
  });

  it("reports clipboard failures without showing success", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "复制" }));
    await waitFor(() => expect(document.querySelector(".referral-panel__feedback")).toHaveTextContent("复制失败，请手动复制推广码"));
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(document.querySelectorAll(".referral-panel__copy-feedback.is-visible")).toHaveLength(0);
  });

  it("restarts copy feedback and clears its timer on unmount", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot());
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = renderPanel();
    const copyButton = await screen.findByRole("button", { name: "复制" });
    vi.useFakeTimers();
    try {
      fireEvent.click(copyButton);
      await act(async () => { await Promise.resolve(); });
      expect(copyButton).toHaveAttribute("aria-label", "复制，已复制");
      act(() => { vi.advanceTimersByTime(1000); });
      fireEvent.click(copyButton);
      await act(async () => { await Promise.resolve(); });
      act(() => { vi.advanceTimersByTime(1000); });
      expect(copyButton).toHaveAttribute("aria-label", "复制，已复制");
      act(() => { vi.advanceTimersByTime(800); });
      expect(copyButton).toHaveAttribute("aria-label", "复制");
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders only safe history fields and does not leak payload data", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ history: [
      { id: 1, event_type: "referral_qualified", payload: { days: 30, effective_count: 6, name: "PRIVATE NAME", order_no: "PRIVATE ORDER" }, created_at: null },
      { id: 2, event_type: "referral_milestone_granted", payload: { threshold: 3, kind: "science_3", reward_type: "entitlement", user: "PRIVATE NAME" }, created_at: "2026-01-01" },
      { id: 3, event_type: "referral_refunded", payload: { progress_removed: true, days_removed: 5, effective_count: 4, access_expires_at: "2026-01-31T00:00:00Z", milestone_changes: [{ threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement" }], order_no: "PRIVATE ORDER" }, created_at: "2026-01-02" },
    ] }));
    renderPanel();
    const history = within(await screen.findByRole("list", { name: "推广记录" }));
    expect(history.getByText(/备考季 \+30 天/)).toBeInTheDocument();
    expect(history.getByText("已达成 3 人里程碑，科普季永久权限已自动发放")).toBeInTheDocument();
    expect(history.getByText(/推广进度已回退.*5 天.*2026/)).toBeInTheDocument();
    expect(history.queryByText(/PRIVATE NAME|PRIVATE ORDER/)).not.toBeInTheDocument();
  });

  it("renders only the four allowed refund milestone outcomes", async () => {
    fetchReferralCampaign.mockResolvedValue(snapshot({ history: [{
      id: 20,
      event_type: "referral_refunded",
      created_at: "2026-02-01T00:00:00Z",
      payload: {
        effective_count: 0,
        milestone_changes: [
          { threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement" },
          { threshold: 5, kind: "vlog_5", outcome: "revoked", reward_type: "coupon" },
          { threshold: 3, kind: "science_3", outcome: "revocation_pending", reward_type: "coupon" },
          { threshold: 5, kind: "vlog_5", outcome: "non_reversible", reward_type: "coupon" },
          { threshold: 3, kind: "science_3", outcome: "unknown", reward_type: "entitlement", secret: "PRIVATE OUTCOME" },
          { threshold: 3, kind: "vlog_5", outcome: "revoked", reward_type: "coupon", secret: "PRIVATE KIND" },
          { threshold: 5, kind: "science_3", outcome: "revoked", reward_type: "entitlement", secret: "PRIVATE THRESHOLD" },
        ],
        private_order: "PRIVATE ORDER",
      },
    }] }));
    renderPanel();
    const history = within(await screen.findByRole("list", { name: "推广记录" }));
    expect(history.getByText(/科普季永久权限已撤销/)).toBeInTheDocument();
    expect(history.getByText(/未使用的Vlog 季 ¥10 替代券已撤销/)).toBeInTheDocument();
    expect(history.getByText(/科普季 ¥10 替代券正在订单中，待订单结束后处理/)).toBeInTheDocument();
    expect(history.getByText(/Vlog 季 ¥10 替代券已使用，无法追回，该里程碑已兑现/)).toBeInTheDocument();
    expect(history.queryByText(/PRIVATE OUTCOME|PRIVATE KIND|PRIVATE THRESHOLD|PRIVATE ORDER|unknown/)).not.toBeInTheDocument();
    expect(history.queryByText(/Vlog 季永久权限已撤销|科普季 ¥10 替代券已撤销/)).not.toBeInTheDocument();
  });

  it("keeps touch targets, breakpoints, and reduced-motion rules explicit", () => {
    expect(panelStyles).toContain("@media (max-width: 768px)");
    expect(panelStyles).toContain("@media (max-width: 480px)");
    expect(panelStyles).toContain("min-height: 44px");
    expect(panelStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(panelStyles).toMatch(/grid-template-columns:\s*repeat\(6,/);
    expect(panelStyles).toMatch(/border-radius:\s*50%/);
    expect(panelStyles).toContain("background: #2d8955");
    expect(panelStyles).toMatch(/:focus-visible/);
    expect(panelStyles).toMatch(/\.referral-panel__completion-mark\s*\{[^}]*position:\s*absolute/s);
    expect(panelStyles).toMatch(/\.referral-panel__completion-mark\s*\{[^}]*color:\s*#fff/s);
    expect(panelStyles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.referral-panel__completion-mark/);
    expect(panelStyles).not.toMatch(/\.referral-panel__action-content\.is-copied\s*\{[^}]*visibility:\s*hidden/s);
    expect(panelStyles).toMatch(/\.referral-panel__action-content\.is-copied\s*\{[^}]*animation:\s*referral-copy-action 1800ms/s);
    expect(panelStyles).toContain("@keyframes referral-copy-action");
    expect(panelStyles).toContain(".referral-panel__copy-feedback.is-visible { animation: referral-copy-feedback 1800ms");
    expect(panelStyles).toMatch(/\.referral-panel__action-content\.is-copied\s*\{ animation: none; opacity: 0; \}/);
    expect(panelStyles).toMatch(/\.referral-panel button\.referral-panel__code-copy,\s*\.referral-panel button\.referral-panel__share-button\s*\{[^}]*border-color:\s*#b6d4bf;[^}]*background:\s*#f4fbf6;[^}]*color:\s*#205b40/s);
    expect(panelStyles).toMatch(/\.referral-panel__code-copy \.referral-panel__copy-feedback,\s*\.referral-panel__share-button \.referral-panel__copy-feedback\s*\{\s*color:\s*#226a45;\s*\}/s);
    expect(panelStyles).toMatch(/@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\.referral-panel button:hover \{ border-color: #80b491; background: #f2fbf4; \}/);
    expect(panelStyles).not.toMatch(/\.referral-panel \.referral-panel__code-copy:hover\s*\{[^}]*#174f32/s);
    expect(panelStyles).not.toMatch(/\.referral-panel \.referral-panel__code-copy:hover \.referral-panel__copy-feedback[^}]*#fff/s);
    expect(panelStyles).not.toContain("reward_30_days");
    expect(panelStyles).not.toContain("season-cover");
    expect(panelStyles).not.toContain("locked-student.png");
    expect(panelStyles).not.toContain("locked-books.png");
    expect(panelStyles).not.toContain("locked-cloud.svg");
    expect(panelStyles).not.toContain("locked-sparkles.svg");
    expect(panelStyles).not.toContain("locked-lock.svg");
    expect(panelStyles).not.toContain("referral-panel__locked-student");
    expect(panelStyles).not.toContain("referral-panel__locked-books");
    expect(panelStyles).not.toContain("referral-panel__locked-cloud");
  });
});
