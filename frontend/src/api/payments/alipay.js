import { apiFetch } from "../client.js";

export async function createAlipayDebugPayment() {
  return apiFetch("/accounts/payments/alipay/debug-create/", {
    method: "POST",
    body: {
      amount: "0.01",
      subject: "Alipay Debug Payment",
    },
  });
}
