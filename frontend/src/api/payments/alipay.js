import { apiFetch } from "../client.js";

const PAYMENT_CONTEXT_KEY = "pendingAlipayPayments";

export async function fetchPurchaseOffers({ moduleKey, seasonNumber } = {}) {
  const sp = new URLSearchParams();
  if (moduleKey) {
    sp.set("module", moduleKey);
  }
  if (Number.isFinite(Number(seasonNumber)) && Number(seasonNumber) > 0) {
    sp.set("season_number", String(Number(seasonNumber)));
  }

  const qs = sp.toString();
  const path = qs
    ? `/accounts/purchase-offers/?${qs}`
    : "/accounts/purchase-offers/";

  const data = await apiFetch(path);
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.results)) {
    return data.results;
  }
  return [];
}

/** Build one opaque client purchase-intent identifier. */
export function createPaymentIntentKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createAlipayPurchase({ offerCode, couponId, idempotencyKey } = {}) {
  const purchaseIntentKey = idempotencyKey || createPaymentIntentKey();
  return apiFetch("/accounts/payments/alipay/create/", {
    method: "POST",
    body: {
      offer_code: offerCode,
      ...(couponId ? { coupon_id: couponId } : {}),
      idempotency_key: purchaseIntentKey,
    },
  });
}

export async function fetchAlipayPaymentStatus(merchantOrderNo) {
  const sp = new URLSearchParams({
    merchant_order_no: String(merchantOrderNo || "").trim(),
  });
  return apiFetch(`/accounts/payments/alipay/status/?${sp.toString()}`);
}

export function savePendingPaymentContext(merchantOrderNo, context = {}) {
  const key = String(merchantOrderNo || "").trim();
  if (!key) {
    return;
  }

  const raw = localStorage.getItem(PAYMENT_CONTEXT_KEY);
  const payload = raw ? JSON.parse(raw) : {};
  payload[key] = {
    returnPath: context.returnPath || "/",
    moduleId: context.moduleId || "",
    createdAt: Date.now(),
  };
  localStorage.setItem(PAYMENT_CONTEXT_KEY, JSON.stringify(payload));
}

export function loadPendingPaymentContext(merchantOrderNo) {
  const key = String(merchantOrderNo || "").trim();
  if (!key) {
    return null;
  }

  const raw = localStorage.getItem(PAYMENT_CONTEXT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw);
    return payload[key] || null;
  } catch {
    return null;
  }
}

export function clearPendingPaymentContext(merchantOrderNo) {
  const key = String(merchantOrderNo || "").trim();
  if (!key) {
    return;
  }

  const raw = localStorage.getItem(PAYMENT_CONTEXT_KEY);
  if (!raw) {
    return;
  }

  try {
    const payload = JSON.parse(raw);
    delete payload[key];
    localStorage.setItem(PAYMENT_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    localStorage.removeItem(PAYMENT_CONTEXT_KEY);
  }
}

export async function createAlipayDebugPayment() {
  return apiFetch("/accounts/payments/alipay/debug-create/", {
    method: "POST",
    body: {
      amount: "0.01",
      subject: "Alipay Debug Payment",
    },
  });
}
