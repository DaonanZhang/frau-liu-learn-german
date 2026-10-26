import { fireEvent, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addRedeemActionToPurchaseModal } from "./modulePurchaseRedeem.js";

describe("addRedeemActionToPurchaseModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("adds redeem=1 to the checkout path and closes before navigating", () => {
    document.body.innerHTML = `
      <div class="swal2-popup">
        <div class="swal2-actions">
          <button class="swal2-confirm">立刻购买</button>
          <button class="swal2-deny">立刻试用</button>
          <button class="swal2-cancel">稍后再看</button>
        </div>
      </div>
    `;
    const popup = document.querySelector(".swal2-popup");
    const navigate = vi.fn();
    const closeModal = vi.fn();

    addRedeemActionToPurchaseModal(popup, "/modules/science-season/purchase", navigate, closeModal);

    const redeemButton = screen.getByRole("button", { name: "立刻兑换" });
    expect(redeemButton.nextElementSibling).toHaveTextContent("稍后再看");

    fireEvent.click(redeemButton);

    expect(closeModal).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/modules/science-season/purchase?redeem=1");
    expect(closeModal.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
  });

  it("preserves an existing checkout query when adding redeem=1", () => {
    document.body.innerHTML = '<div class="swal2-popup"><div class="swal2-actions"></div></div>';
    const navigate = vi.fn();

    addRedeemActionToPurchaseModal(
      document.querySelector(".swal2-popup"),
      "/modules/exam-preparation/purchase?return_to=%2Fmodules%2Fexam-preparation%2Fb1",
      navigate,
      vi.fn(),
    );

    fireEvent.click(screen.getByRole("button", { name: "立刻兑换" }));

    expect(navigate).toHaveBeenCalledWith(
      "/modules/exam-preparation/purchase?return_to=%2Fmodules%2Fexam-preparation%2Fb1&redeem=1",
    );
  });

  it("does not add a duplicate redeem action when initialized twice", () => {
    document.body.innerHTML = `
      <div class="swal2-popup">
        <div class="swal2-actions"></div>
      </div>
    `;
    const popup = document.querySelector(".swal2-popup");

    addRedeemActionToPurchaseModal(popup, "/modules/science-season/purchase", vi.fn(), vi.fn());
    addRedeemActionToPurchaseModal(popup, "/modules/science-season/purchase", vi.fn(), vi.fn());

    expect(screen.getAllByRole("button", { name: "立刻兑换" })).toHaveLength(1);
  });
});
