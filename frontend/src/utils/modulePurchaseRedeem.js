const REDEEM_BUTTON_CLASS = "module-purchase-modal-redeem";

export function addRedeemActionToPurchaseModal(popup, navigate, closeModal) {
  const actions = popup?.querySelector(".swal2-actions");
  if (!actions || actions.querySelector(`.${REDEEM_BUTTON_CLASS}`)) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = REDEEM_BUTTON_CLASS;
  button.textContent = "立刻兑换";
  button.addEventListener("click", () => {
    closeModal();
    navigate("/redeem-code");
  });

  const cancelButton = actions.querySelector(".swal2-cancel");
  actions.insertBefore(button, cancelButton);
}
