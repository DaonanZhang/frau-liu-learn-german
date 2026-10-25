import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CheckoutCodeRedemption from "./CheckoutCodeRedemption.jsx";
import { redeemCode } from "../api/auth/auth.js";

vi.mock("../api/auth/auth.js", () => ({ redeemCode: vi.fn() }));

describe("CheckoutCodeRedemption", () => {
  beforeEach(() => redeemCode.mockReset());

  function renderControl(callbacks = {}) {
    return render(<CheckoutCodeRedemption module="learning_by_video" {...callbacks} />);
  }

  it("applies activation entitlements once", async () => {
    const result = { type: "activation", entitlements: [{ id: 4 }] };
    const onActivationApplied = vi.fn();
    redeemCode.mockResolvedValue(result);
    renderControl({ onActivationApplied });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ACT" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(onActivationApplied).toHaveBeenCalledExactlyOnceWith(result));
  });

  it.each([
    ["promotion", { type: "promotion", coupon: { id: 1 } }],
    ["referral issued", { type: "referral", outcome: "issued", coupon: { id: 2 } }],
    ["referral already issued", { type: "referral", outcome: "already_issued", coupon: { id: 3 } }],
  ])("reports a coupon for %s", async (_name, result) => {
    const onCouponIssued = vi.fn();
    redeemCode.mockResolvedValue(result);
    renderControl({ onCouponIssued });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(onCouponIssued).toHaveBeenCalledExactlyOnceWith(result.coupon, result));
  });

  it("asks before replacing a referral coupon and confirms with the replacement flag", async () => {
    redeemCode.mockResolvedValueOnce({ type: "referral", outcome: "replacement_required", message: "确认更换", replacement: {} });
    const result = { type: "referral", outcome: "issued", coupon: { id: 4 } };
    redeemCode.mockResolvedValueOnce(result);
    const onCouponIssued = vi.fn();
    renderControl({ onCouponIssued });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("同活动旧优惠券将被替换");
    fireEvent.click(screen.getByRole("button", { name: "确认替换" }));
    await waitFor(() => expect(redeemCode).toHaveBeenNthCalledWith(2, "REF", { confirmReplace: true }));
    await waitFor(() => expect(onCouponIssued).toHaveBeenCalledExactlyOnceWith(result.coupon, result));
  });

  it("cancels replacement without making another request", async () => {
    redeemCode.mockResolvedValue({ type: "referral", outcome: "replacement_required", replacement: {} });
    renderControl();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));
    expect(redeemCode).toHaveBeenCalledTimes(1);
  });

  it("shows structured server errors and permits retry", async () => {
    redeemCode.mockRejectedValueOnce({ data: { code: "invalid_code", message: "推广码无效" } }).mockResolvedValueOnce({ type: "promotion", coupon: { id: 8 } });
    const onCouponIssued = vi.fn();
    renderControl({ onCouponIssued });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "TRY" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("推广码无效");
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(onCouponIssued).toHaveBeenCalledTimes(1));
  });

  it("prevents duplicate submissions while pending", async () => {
    let finish;
    redeemCode.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderControl();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ONE" } });
    const button = screen.getByRole("button", { name: "兑换" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(redeemCode).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    finish({ type: "promotion", coupon: { id: 9 } });
  });

  it("keeps labels and dialog title IDs unique across multiple instances", async () => {
    redeemCode.mockResolvedValue({ type: "referral", outcome: "replacement_required", replacement: {} });
    const { container } = render(
      <>
        <CheckoutCodeRedemption module="a" />
        <CheckoutCodeRedemption module="b" />
      </>,
    );
    const inputs = [...container.querySelectorAll("input")];
    const labels = [...container.querySelectorAll("label")];
    expect(inputs).toHaveLength(2);
    expect(new Set([...container.querySelectorAll("[id]")].map((node) => node.id)).size)
      .toBe(container.querySelectorAll("[id]").length);
    expect(labels.map((label) => label.htmlFor)).toEqual(inputs.map((input) => input.id));
    inputs.forEach((input) => expect(input.labels).toContain(labels.find((label) => label.htmlFor === input.id)));
    inputs.forEach((input) => fireEvent.change(input, { target: { value: "REF" } }));
    fireEvent.click(screen.getAllByRole("button", { name: "兑换" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(container.querySelector(`#${dialog.getAttribute("aria-labelledby")}`)).toHaveTextContent("确认替换优惠券");
  });

  it.each([
    ["coupon", { type: "promotion", coupon: { id: 12 } }, "onCouponIssued"],
    ["activation", { type: "activation", entitlements: [{ id: 5 }] }, "onActivationApplied"],
  ])("holds pending through the async %s callback", async (_name, result, callbackName) => {
    let finishCallback;
    const callback = vi.fn(() => new Promise((resolve) => { finishCallback = resolve; }));
    redeemCode.mockResolvedValue(result);
    renderControl({ [callbackName]: callback });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "WAIT" } });
    const button = screen.getByRole("button", { name: "兑换" });
    fireEvent.click(button);
    await waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(redeemCode).toHaveBeenCalledOnce();
    finishCallback();
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(button).not.toHaveTextContent("处理中");
  });

  it("shows callback failures without suggesting the consumed code can be retried", async () => {
    redeemCode.mockResolvedValue({ type: "promotion", coupon: { id: 13 } });
    renderControl({ onCouponIssued: vi.fn().mockRejectedValue(new Error("Refresh failed")) });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "RETRY" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("优惠券已领取，但页面刷新失败，请刷新页面查看。");
    expect(redeemCode).toHaveBeenCalledOnce();
  });

  it.each([
    ["coupon", { type: "promotion", coupon: { id: 14 } }, "onCouponIssued", "优惠券已领取，但页面刷新失败，请刷新页面查看。"],
    ["activation", { type: "activation", entitlements: [{ id: 6 }] }, "onActivationApplied", "权限已激活，但页面刷新失败，请刷新页面查看。"],
  ])("does not offer retry after successful %s redemption when refresh fails", async (_name, result, callbackName, expectedMessage) => {
    redeemCode.mockResolvedValue(result);
    renderControl({ [callbackName]: vi.fn().mockRejectedValue(new Error("Refresh failed")) });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "SINGLE-USE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expectedMessage);
    expect(alert).not.toHaveTextContent(/兑换失败|请重试/);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "兑换" })).toBeDisabled();
    expect(redeemCode).toHaveBeenCalledOnce();
  });

  it("moves focus into replacement dialog and traps Tab between its actions", async () => {
    redeemCode.mockResolvedValue({ type: "referral", outcome: "replacement_required", replacement: {} });
    renderControl();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    const submit = screen.getByRole("button", { name: "兑换" });
    submit.focus();
    fireEvent.click(submit);
    const cancel = await screen.findByRole("button", { name: "取消" });
    const confirm = screen.getByRole("button", { name: "确认替换" });
    await waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it("cancels replacement on Escape and restores focus without redeeming again", async () => {
    redeemCode.mockResolvedValue({ type: "referral", outcome: "replacement_required", replacement: {} });
    renderControl();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    const submit = screen.getByRole("button", { name: "兑换" });
    submit.focus();
    fireEvent.click(submit);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(submit).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(redeemCode).toHaveBeenCalledOnce();
  });

  it("restores focus after a confirmed replacement request fails", async () => {
    redeemCode
      .mockResolvedValueOnce({
        type: "referral",
        outcome: "replacement_required",
        replacement: {},
      })
      .mockRejectedValueOnce({ data: { message: "暂时无法替换" } });
    renderControl();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "REF" } });
    const submit = screen.getByRole("button", { name: "兑换" });
    submit.focus();
    fireEvent.click(submit);
    const confirm = await screen.findByRole("button", { name: "确认替换" });
    await waitFor(() => expect(screen.getByRole("button", { name: "取消" })).toHaveFocus());

    fireEvent.click(confirm);

    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法替换");
    await waitFor(() => expect(submit).toBeEnabled());
    expect(submit).toHaveFocus();
    expect(redeemCode).toHaveBeenCalledTimes(2);
  });

  it("provides accessible labels and minimum-size responsive controls", () => {
    const { container } = renderControl();
    expect(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(container.querySelector(".checkout-code-redemption")).toBeInTheDocument();
    const css = readFileSync("src/components/CheckoutCodeRedemption.css", "utf8");
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*360px\)/);
    expect(css).toMatch(/:focus-visible/);
  });
});
