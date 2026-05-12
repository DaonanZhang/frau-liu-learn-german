import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useAuth } from "../../api/auth/useAuth.js";
import useMaxWidth from "../../hooks/useMaxWidth.js";
import { createAlipayPurchase, fetchPurchaseOffers, savePendingPaymentContext } from "../../api/payments/alipay.js";
import "./ModuleEntryCard.css";

function buildCoverCandidates(src) {
  const normalized = typeof src === "string" ? src.trim() : "";
  if (!normalized) {
    return [];
  }
  if (/\.(png|jpe?g|webp)$/i.test(normalized)) {
    return [normalized];
  }
  return [`${normalized}.png`, `${normalized}.jpg`, `${normalized}.webp`];
}

function hasModuleAccess(user, module) {
  if (!user || !module?.moduleKey) {
    return false;
  }

  if (user.is_staff || user.is_superuser) {
    return true;
  }

  const entitlements = Array.isArray(user.entitlements) ? user.entitlements : [];
  const allowedSeasonNumbers = Array.isArray(module?.seasonNumbers)
    ? module.seasonNumbers.map((item) => Number(item)).filter(Number.isFinite)
    : [Number(module?.seasonNumber)].filter(Number.isFinite);

  return entitlements.some((item) => {
    if (!item?.is_valid_now) {
      return false;
    }

    const scope = String(item.scope || "");
    if (scope === "platform") {
      return true;
    }

    const moduleKey = item?.module?.key;
    if (moduleKey !== module.moduleKey) {
      return false;
    }

    if (!item?.season) {
      return true;
    }

    return allowedSeasonNumbers.includes(Number(item.season?.season_number));
  });
}

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

function getPurchaseSeasonNumber(module) {
  const seasonNumber = Number(module?.purchaseSeasonNumber ?? module?.seasonNumber);
  return Number.isFinite(seasonNumber) && seasonNumber > 0 ? seasonNumber : null;
}

function formatPromoPrice(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return String(numeric.toFixed(1)).replace(/\.0$/, "");
}

function getDisplayPrice(offer) {
  const finalPrice = Number(offer?.final_price_amount);
  if (Number.isFinite(finalPrice)) {
    return finalPrice;
  }
  return Number(offer?.price_amount);
}

function buildCheckoutModalHtml(module, offers) {
  const cards = offers.map((offer) => {
    const originalPrice = Number(module?.originalPrice);
    const originalPriceHtml = Number.isFinite(originalPrice)
      ? `<span class="module-checkout-modal__price-original">¥${escapeHtml(formatPromoPrice(originalPrice))}</span>`
      : "";
    const hasDiscount = Boolean(offer?.is_discounted_for_user) && Number(offer?.discount_amount) > 0;
    const discountBadgeHtml = hasDiscount
      ? `<div class="module-checkout-modal__discount-badge">${escapeHtml(offer?.discount_label || "试用用户专享")}</div>`
      : "";
    const discountNoteHtml = hasDiscount
      ? `<div class="module-checkout-modal__discount-note">已减 ¥${escapeHtml(formatPromoPrice(offer?.discount_amount))}</div>`
      : "";

    return `
      <article class="module-checkout-modal__offer">
        <div class="module-checkout-modal__offer-top">
          <div>
            <h3 class="module-checkout-modal__offer-title">${escapeHtml(module?.title || offer?.title || "")}</h3>
            <p class="module-checkout-modal__offer-meta">一经购买，终身有效</p>
            ${discountBadgeHtml}
          </div>
          <div class="module-checkout-modal__price-block">
            <div class="module-checkout-modal__price-row">
              ${originalPriceHtml}
              <span class="module-checkout-modal__price-sale${hasDiscount ? " module-checkout-modal__price-sale--discount" : ""}">¥${escapeHtml(formatPromoPrice(getDisplayPrice(offer)))}</span>
            </div>
            ${discountNoteHtml}
          </div>
        </div>
        <p class="module-checkout-modal__offer-description">解锁 ${escapeHtml(module?.title || "")} 全部正式学习内容、工具与后续学习体验。</p>
      </article>
    `;
  }).join("");

  return `<div class="module-checkout-modal">${cards}</div>`;
}

export default function ModuleEntryCard({ module }) {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const isMobileView = useMaxWidth(990);
  const [failedSources, setFailedSources] = useState({});
  const canEnterModule = useMemo(() => hasModuleAccess(user, module), [user, module]);

  const coverCandidates = useMemo(() => buildCoverCandidates(module?.image), [module?.image]);
  const coverSrc = coverCandidates.find((item) => !failedSources[item]) || "";

  async function handleDesktopPurchase() {
    const offers = await fetchPurchaseOffers({
      moduleKey: module?.moduleKey,
      seasonNumber: getPurchaseSeasonNumber(module),
    });

    if (!Array.isArray(offers) || offers.length === 0) {
      await Swal.fire({
        title: "暂未开放购买",
        text: "当前模块暂未配置可售商品。",
        confirmButtonText: "知道了",
        customClass: {
          popup: "module-purchase-modal-popup",
          title: "module-purchase-modal-title",
          actions: "module-purchase-modal-actions",
          confirmButton: "module-purchase-modal-cancel",
        },
        buttonsStyling: false,
      });
      return;
    }

    const [offer] = offers;
    const result = await Swal.fire({
      title: module?.title || "立刻购买",
      html: buildCheckoutModalHtml(module, [offer]),
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "去支付宝支付",
      denyButtonText: "立刻试用",
      cancelButtonText: "稍后再说",
      customClass: {
        popup: "module-purchase-modal-popup module-checkout-modal-popup",
        title: "module-purchase-modal-title",
        htmlContainer: "module-purchase-modal-container",
        actions: "module-purchase-modal-actions",
        confirmButton: "module-purchase-modal-confirm",
        denyButton: "module-purchase-modal-confirm",
        cancelButton: "module-purchase-modal-cancel",
      },
      buttonsStyling: false,
      width: 720,
      preConfirm: async () => {
        if (!isAuthenticated) {
          navigate("/login");
          return false;
        }

        const order = await createAlipayPurchase({
          offerCode: offer.code,
        });
        savePendingPaymentContext(order?.merchant_order_no, {
          returnPath: window.location.pathname + window.location.search + window.location.hash,
          moduleId: module?.id || "",
        });
        const payUrl = String(order?.pay_url || "").trim();
        if (!payUrl) {
          throw new Error("Missing pay_url");
        }
        window.location.assign(payUrl);
        return true;
      },
    });

    if (result.isDenied && module?.route) {
      navigate(module.route);
    }
  }

  async function handlePrimaryAction() {
    if (canEnterModule && module?.route) {
      navigate(module.route);
      return;
    }

    if (isMobileView && module?.id) {
      navigate(`/modules/${module.id}/preview`);
      return;
    }

    const result = await Swal.fire({
      title: module?.title || "立刻查看",
      html: buildPurchaseModalHtml(module),
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "立刻购买",
      denyButtonText: "立刻试用",
      cancelButtonText: "稍后再看",
      customClass: {
        popup: "module-purchase-modal-popup",
        title: "module-purchase-modal-title",
        htmlContainer: "module-purchase-modal-container",
        actions: "module-purchase-modal-actions",
        confirmButton: "module-purchase-modal-confirm",
        denyButton: "module-purchase-modal-confirm",
        cancelButton: "module-purchase-modal-cancel",
      },
      buttonsStyling: false,
      width: 720,
      didOpen: () => {
        const button = Swal.getConfirmButton();
        if (button) {
          button.disabled = true;
          button.style.opacity = "0.6";
          button.style.cursor = "not-allowed";
          button.style.pointerEvents = "none";
        }
      },
    });

    if (result.isConfirmed) {
      if (isMobileView) {
        navigate(`/modules/${module.id}/purchase`);
        return;
      }

      try {
        await handleDesktopPurchase();
      } catch (error) {
        await Swal.fire({
          title: "创建支付订单失败",
          text: error?.data?.detail || error?.message || "请稍后再试。",
          confirmButtonText: "知道了",
          customClass: {
            popup: "module-purchase-modal-popup",
            title: "module-purchase-modal-title",
            actions: "module-purchase-modal-actions",
            confirmButton: "module-purchase-modal-cancel",
          },
          buttonsStyling: false,
        });
      }
      return;
    }

    if (result.isDenied && module?.route) {
      navigate(module.route);
    }
  }

  return (
    <article
      className="module-entry-card"
      role="button"
      tabIndex={0}
      onClick={handlePrimaryAction}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlePrimaryAction();
        }
      }}
    >
      <div className="module-entry-card__media">
        {coverSrc ? (
          <img
            className="module-entry-card__image"
            src={coverSrc}
            alt={module?.title || "module"}
            onError={() => {
              setFailedSources((previous) => ({
                ...previous,
                [coverSrc]: true,
              }));
            }}
          />
        ) : (
          <div className="module-entry-card__image module-entry-card__image--placeholder" />
        )}
        <div className="module-entry-card__overlay" />
        {module?.badge ? <span className="module-entry-card__badge">{module.badge}</span> : null}
      </div>

      <div className="module-entry-card__body">
        <div className="module-entry-card__heading">
          <h2 className="module-entry-card__title">{module?.title}</h2>
          {module?.subtitle ? (
            <p className="module-entry-card__subtitle">{module.subtitle}</p>
          ) : null}
        </div>

        {module?.description ? (
          <p className="module-entry-card__description">{module.description}</p>
        ) : null}

        <div className="module-entry-card__chips">
          {(module?.stats || []).map((item) => (
            <span key={item} className="module-entry-card__chip">
              {item}
            </span>
          ))}
        </div>

        <div className="module-entry-card__cta">
          <span>{canEnterModule ? "进入模块" : "立刻查看"}</span>
          <span aria-hidden="true">→</span>
        </div>
      </div>
    </article>
  );
}
