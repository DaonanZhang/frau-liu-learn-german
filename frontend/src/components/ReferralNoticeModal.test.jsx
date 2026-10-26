import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchUnreadReferralNotices: vi.fn(), acknowledgeReferralNotice: vi.fn() }));
vi.mock("../api/referrals.js", () => api);

import ReferralNoticeModal from "./ReferralNoticeModal.jsx";

const styles = readFileSync(resolve("src/components/ReferralNoticeModal.css"), "utf8");
const componentSource = readFileSync(resolve("src/components/ReferralNoticeModal.jsx"), "utf8");
const notice = (id, payload = {}, overrides = {}) => ({ id, event_type: "referral_refunded", payload, created_at: "2026-01-02T00:00:00Z", is_global_notice: true, acknowledged_at: null, ...overrides });

beforeEach(() => {
  api.fetchUnreadReferralNotices.mockReset();
  api.acknowledgeReferralNotice.mockReset();
  api.acknowledgeReferralNotice.mockResolvedValue({});
  document.body.style.overflow = "";
});
afterEach(() => { document.body.style.overflow = ""; });

describe("ReferralNoticeModal", () => {
  it("does not render anything when there are no unread notices", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([]);
    const { container } = render(<ReferralNoticeModal />);
    await waitFor(() => expect(api.fetchUnreadReferralNotices).toHaveBeenCalledOnce());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only safe refund details and does not acknowledge on render, Escape, or overlay interaction", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, {
      progress_removed: true, days_removed: 12, access_expires_at: "2027-03-04T00:00:00Z", effective_count: 4,
      milestone_changes: [
        { threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement" },
        { threshold: 5, kind: "vlog_5", outcome: "revoked", reward_type: "coupon" },
      ], order_no: "SECRET ORDER",
    })]);
    render(<ReferralNoticeModal />);
    const dialog = await screen.findByRole("dialog", { name: "推广奖励更新" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(dialog).toHaveTextContent("一笔通过推广码购买的备考季订单已全额退款");
    expect(dialog).toHaveTextContent("本次退款已移除一位有效推广，推广进度已回退。");
    expect(dialog).toHaveTextContent("当前有效推广人数：4");
    expect(dialog).toHaveTextContent("减少 12 天");
    expect(dialog).toHaveTextContent(new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date("2027-03-04T00:00:00Z")));
    expect(dialog).toHaveTextContent("科普季永久权限已撤销");
    expect(dialog).toHaveTextContent("未使用的Vlog 季 ¥10 替代券已撤销");
    expect(dialog).not.toHaveTextContent("SECRET ORDER");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.querySelector(".referral-notice__overlay"));
    expect(api.acknowledgeReferralNotice).not.toHaveBeenCalled();
  });

  it.each([
    [{ threshold: 3, kind: "science_3", outcome: "revocation_pending", reward_type: "coupon" }, "科普季 ¥10 替代券正在订单中，待订单结束后处理"],
    [{ threshold: 5, kind: "vlog_5", outcome: "non_reversible", reward_type: "coupon" }, "Vlog 季 ¥10 替代券已使用，无法追回，该里程碑已兑现"],
  ])("shows a recognized coupon outcome", async (change, copy) => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, { milestone_changes: [change] })]);
    render(<ReferralNoticeModal />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it.each([
    ["no_days", { days_removed: "bad", access_expires_at: "invalid" }, "本次未缩短当前可用期限"],
    ["zero_days", { days_removed: 0, access_expires_at: null }, "本次未缩短当前可用期限"],
    ["null_days", { days_removed: null, access_expires_at: null }, "本次未缩短当前可用期限"],
  ])("uses safe fallback for %s", async (_label, payload, fallback) => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, payload)]);
    render(<ReferralNoticeModal />);
    expect(await screen.findByRole("dialog")).toHaveTextContent(fallback);
  });

  it.each([true, -1, 30.01, Number.NaN])("rejects invalid removed day values %s", async (days_removed) => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, { days_removed })]);
    render(<ReferralNoticeModal />);
    expect(await screen.findByRole("dialog")).toHaveTextContent("本次未缩短当前可用期限");
  });

  it("preserves fractional days and uses the browser time zone for expiry dates", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, { days_removed: 29.75, access_expires_at: "2027-03-04T00:00:00Z" })]);
    render(<ReferralNoticeModal />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("本次减少 29.75 天");
    expect(dialog).toHaveTextContent(new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date("2027-03-04T00:00:00Z")));
    expect(componentSource).not.toContain('timeZone: "UTC"');
  });

  it.each([
    [0, "当前有效推广人数：0"],
    [1000000, "当前有效推广人数：1000000"],
    [true, "当前有效推广人数暂不可用。"],
    [-1, "当前有效推广人数暂不可用。"],
    [1000001, "当前有效推广人数暂不可用。"],
  ])("uses the safe effective count fallback for %s", async (effective_count, expected) => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, { effective_count })]);
    render(<ReferralNoticeModal />);
    expect(await screen.findByRole("dialog")).toHaveTextContent(expected);
  });

  it.each([
    [notice(1, {}, { is_global_notice: false }), "non-global"],
    [notice(1, {}, { acknowledged_at: "2026-02-01T00:00:00Z" }), "acknowledged"],
    [notice(0), "zero id"],
    [notice(-1), "negative id"],
    [notice("1"), "string id"],
    [notice(Number.MAX_SAFE_INTEGER + 1), "unsafe integer id"],
  ])("ignores %s notices", async (invalidNotice) => {
    api.fetchUnreadReferralNotices.mockResolvedValue([invalidNotice]);
    const { container } = render(<ReferralNoticeModal />);
    await waitFor(() => expect(api.fetchUnreadReferralNotices).toHaveBeenCalledOnce());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(api.acknowledgeReferralNotice).not.toHaveBeenCalled();
  });

  it.each([
    [{ threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement" }, "科普季永久权限已撤销"],
    [{ threshold: 5, kind: "vlog_5", outcome: "revoked", reward_type: "entitlement" }, "Vlog 季永久权限已撤销"],
  ])("renders revoked entitlement for the matching threshold and kind", async (change, copy) => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, { milestone_changes: [change] })]);
    render(<ReferralNoticeModal />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it("ignores mismatched milestone identifiers and private payload fields", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1, {
      order_no: "SECRET ORDER",
      milestone_changes: [
        { threshold: 3, kind: "science_3", outcome: "revoked", reward_type: "entitlement" },
        { threshold: 3, kind: "vlog_5", outcome: "revoked", reward_type: "entitlement", private: "SECRET CHANGE" },
      ],
    })]);
    render(<ReferralNoticeModal />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("科普季永久权限已撤销");
    expect(dialog).not.toHaveTextContent(/SECRET|Vlog 季永久权限/);
  });

  it("keeps the notice on acknowledgement failure and allows retry without double acknowledging", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1)]);
    let rejectAck;
    api.acknowledgeReferralNotice.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectAck = reject; })).mockResolvedValueOnce({});
    render(<ReferralNoticeModal />);
    const button = await screen.findByRole("button", { name: "我知道了" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    rejectAck(new Error("failed"));
    await screen.findByRole("alert");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "我知道了" })).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(api.acknowledgeReferralNotice).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("acknowledges once despite a rapid double click, then displays notices in API order", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(10, { effective_count: 0 }), notice(9, { effective_count: 0 })]);
    let resolveAck;
    api.acknowledgeReferralNotice.mockImplementation(() => new Promise((resolvePromise) => { resolveAck = resolvePromise; }));
    render(<ReferralNoticeModal />);
    const button = await screen.findByRole("button", { name: "我知道了" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.acknowledgeReferralNotice).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    resolveAck({});
    await waitFor(() => expect(api.acknowledgeReferralNotice).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("当前有效推广人数：0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "我知道了" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "我知道了" }));
    await waitFor(() => expect(api.acknowledgeReferralNotice).toHaveBeenCalledTimes(2));
    resolveAck({});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.acknowledgeReferralNotice).toHaveBeenNthCalledWith(2, 9);
  });

  it("shows a compact fetch error and retries", async () => {
    api.fetchUnreadReferralNotices.mockRejectedValueOnce(new Error()).mockResolvedValueOnce([notice(1)]);
    render(<ReferralNoticeModal />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("focuses the confirmation button, traps tab, restores focus, and unlocks body scroll", async () => {
    api.fetchUnreadReferralNotices.mockResolvedValue([notice(1)]);
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<ReferralNoticeModal />);
    const button = await screen.findByRole("button", { name: "我知道了" });
    expect(button).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(button, { key: "Tab" });
    expect(button).toHaveFocus();
    fireEvent.click(button);
    await waitFor(() => expect(opener).toHaveFocus());
    unmount();
    opener.remove();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps accessible responsive touch controls and reduced-motion rules", () => {
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("touch-action:");
    expect(styles).toContain("user-select:");
    expect(styles).toContain("@media (max-width: 768px)");
    expect(styles).toContain("@media (max-width: 480px)");
    expect(styles).toContain("@media (hover: hover) and (pointer: fine)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).not.toMatch(/transition:\s*all\b/);
  });
});
