import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ActivateEntitlementPage from "./ActivateEntitlementPage.jsx";

const mocks = vi.hoisted(() => ({ redeemCode: vi.fn(), reloadMe: vi.fn(), logout: vi.fn(), swalFire: vi.fn() }));

vi.mock("../api/auth/auth", () => ({ redeemCode: mocks.redeemCode }));
vi.mock("../api/auth/useAuth.js", () => ({ useAuth: () => ({ reloadMe: mocks.reloadMe, logout: mocks.logout }) }));
vi.mock("sweetalert2", () => ({ default: { fire: mocks.swalFire } }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.hash}</div>;
}

function renderPage() {
  return render(<MemoryRouter initialEntries={["/redeem-code"]}><Routes><Route path="/redeem-code" element={<><ActivateEntitlementPage /><LocationProbe /></>} /><Route path="*" element={<LocationProbe />} /></Routes></MemoryRouter>);
}

describe("ActivateEntitlementPage", () => {
  beforeEach(() => {
    mocks.redeemCode.mockReset();
    mocks.reloadMe.mockReset().mockResolvedValue({});
    mocks.logout.mockReset();
    mocks.swalFire.mockReset().mockResolvedValue({ isConfirmed: true });
  });

  it("labels activation, coupon, and promotion codes", () => {
    renderPage();
    expect(screen.getByText("输入激活码、优惠码或推广码，兑换权限或优惠")).toBeInTheDocument();
  });

  it.each([
    [{ type: "referral", outcome: "issued", coupon: { discount_amount: "10", profile_path: "/profile#coupons" } }, "优惠领取成功"],
    [{ type: "referral", outcome: "already_issued", coupon: { discount_amount: "10", profile_path: "/profile#coupons" } }, "优惠领取成功"],
    [{ type: "promotion", outcome: "issued", coupon: { discount_amount: "10", profile_path: "/profile#coupons" } }, "优惠领取成功"],
  ])("routes coupon outcome to coupon profile instead of activation", async (result, expectedTitle) => {
    mocks.redeemCode.mockResolvedValue(result);
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/profile#coupons"));
    expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ title: expectedTitle }));
    expect(mocks.reloadMe).not.toHaveBeenCalled();
  });

  it("asks whether to replace an existing referral coupon and confirms with the flag", async () => {
    mocks.redeemCode.mockResolvedValueOnce({ type: "referral", outcome: "replacement_required", coupon: { campaign: "spring" } })
      .mockResolvedValueOnce({ type: "referral", outcome: "issued", coupon: { discount_amount: "10", profile_path: "/profile#coupons" } });
    mocks.swalFire.mockResolvedValueOnce({ isConfirmed: true }).mockResolvedValueOnce({});
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ showCancelButton: true })));
    await waitFor(() => expect(mocks.redeemCode).toHaveBeenNthCalledWith(2, "REF", { confirmReplace: true }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/profile#coupons"));
  });

  it("cancels replacement without a second redemption", async () => {
    mocks.redeemCode.mockResolvedValue({ type: "referral", outcome: "replacement_required" });
    mocks.swalFire.mockResolvedValue({ isConfirmed: false });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ showCancelButton: true })));
    expect(mocks.redeemCode).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location")).toHaveTextContent("/redeem-code");
  });

  it("shows a structured retry error after confirmed replacement fails", async () => {
    mocks.redeemCode.mockResolvedValueOnce({ type: "referral", outcome: "replacement_required" })
      .mockRejectedValueOnce({ status: 400, data: { message: "替换失败，请稍后重试" } });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    const submit = screen.getByRole("button", { name: "立即兑换" });
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.redeemCode).toHaveBeenNthCalledWith(2, "REF", { confirmReplace: true }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: "error", text: "替换失败，请稍后重试" })));
    expect(mocks.redeemCode).toHaveBeenCalledTimes(2);
    expect(mocks.reloadMe).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe("/redeem-code");
    expect(submit).toBeEnabled();
  });

  it("reloads permissions and returns home after activation", async () => {
    mocks.redeemCode.mockResolvedValue({ type: "activation", entitlements: [] });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ACT" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/"));
    expect(mocks.reloadMe).toHaveBeenCalledOnce();
    expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ title: "激活成功" }));
  });

  it.each([
    ["replacement still required", { type: "referral", outcome: "replacement_required", message: "仍需替换" }, { type: "referral", outcome: "replacement_required", message: "仍需确认" }, "仍需确认"],
    ["unknown response", { type: "unknown", message: "无法识别兑换结果" }, null, "无法识别兑换结果"],
  ])("does not treat %s as activation", async (_name, initialResult, confirmedResult, expectedMessage) => {
    mocks.redeemCode.mockResolvedValueOnce(initialResult);
    if (confirmedResult) {
      mocks.redeemCode.mockResolvedValueOnce(confirmedResult);
      mocks.swalFire.mockResolvedValueOnce({ isConfirmed: true });
    }
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: "error", text: expectedMessage })));
    expect(mocks.reloadMe).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe("/redeem-code");
    expect(mocks.swalFire).not.toHaveBeenCalledWith(expect.objectContaining({ title: "激活成功" }));
  });

  it("prefers structured server message over detail for redeem errors", async () => {
    mocks.redeemCode.mockRejectedValue({ status: 400, data: { message: "结构化消息", detail: "备用详情" } });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "BAD" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: "结构化消息" })));
  });

  it("preserves the retry guidance for server errors", async () => {
    mocks.redeemCode.mockRejectedValue({ status: 500, data: { detail: "private detail" } });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ title: "兑换暂时失败", text: expect.stringContaining("稍后重试") })));
  });

  it("logs out and returns to login after an unauthorized response", async () => {
    mocks.redeemCode.mockRejectedValue({ status: 401, data: { detail: "expired" } });
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "立即兑换" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/login"));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it("blocks duplicate submissions while redeeming", async () => {
    let finish;
    mocks.redeemCode.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ONE" } });
    const submit = screen.getByRole("button", { name: "立即兑换" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.redeemCode).toHaveBeenCalledOnce();
    expect(submit).toBeDisabled();
    finish({ type: "activation", entitlements: [] });
  });
});
