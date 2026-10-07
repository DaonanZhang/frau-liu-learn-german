import { fireEvent, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addRedeemActionToPurchaseModal } from "./modulePurchaseRedeem.js";

describe("addRedeemActionToPurchaseModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("adds a redeem action before cancel and navigates to the redemption page", () => {
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

    addRedeemActionToPurchaseModal(popup, navigate, closeModal);

    const redeemButton = screen.getByRole("button", { name: "立刻兑换" });
    expect(redeemButton.nextElementSibling).toHaveTextContent("稍后再看");

    fireEvent.click(redeemButton);

    expect(closeModal).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/redeem-code");
  });

  it("does not add a duplicate redeem action when initialized twice", () => {
    document.body.innerHTML = `
      <div class="swal2-popup">
        <div class="swal2-actions"></div>
      </div>
    `;
    const popup = document.querySelector(".swal2-popup");

    addRedeemActionToPurchaseModal(popup, vi.fn(), vi.fn());
    addRedeemActionToPurchaseModal(popup, vi.fn(), vi.fn());

    expect(screen.getAllByRole("button", { name: "立刻兑换" })).toHaveLength(1);
  });
});
