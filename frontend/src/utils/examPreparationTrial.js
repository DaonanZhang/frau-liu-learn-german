import Swal from "sweetalert2";
import { EXAM_PREPARATION_MODULE } from "../pages/Homepage/homeShared.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPurchaseModalHtml(module) {
  const image = module?.image
    ? `<img class="module-purchase-modal__image" src="${escapeHtml(module.image)}" alt="${escapeHtml(module.title)}" />`
    : "";
  const labels = Array.isArray(module?.purchaseLabels) && module.purchaseLabels.length
    ? `<div class="module-purchase-modal__labels">${module.purchaseLabels
      .map((item) => `<span class="module-purchase-modal__label">${escapeHtml(item)}</span>`)
      .join("")}</div>`
    : "";
  const description = module?.purchaseDescription
    ? `<p class="module-purchase-modal__description">${escapeHtml(module.purchaseDescription)}</p>`
    : "";
  const features = Array.isArray(module?.purchaseFeatures) && module.purchaseFeatures.length
    ? `<ul class="module-purchase-modal__list">${module.purchaseFeatures
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ul>`
    : "";

  return `
    <div class="module-purchase-modal">
      ${image}
      ${labels}
      ${description}
      ${features}
    </div>
  `;
}

export async function showExamPreparationPurchasePrompt(navigate) {
  const module = EXAM_PREPARATION_MODULE;
  const result = await Swal.fire({
    title: module.title,
    html: buildPurchaseModalHtml(module),
    showDenyButton: true,
    showCancelButton: false,
    confirmButtonText: "立刻购买",
    denyButtonText: "继续试用",
    customClass: {
      popup: "module-purchase-modal-popup",
      title: "module-purchase-modal-title",
      htmlContainer: "module-purchase-modal-container",
      actions: "module-purchase-modal-actions",
      confirmButton: "module-purchase-modal-confirm",
      denyButton: "module-purchase-modal-confirm",
    },
    buttonsStyling: false,
    width: 720,
  });

  if (result.isConfirmed) {
    navigate("/modules/exam-preparation/purchase");
  }
}
