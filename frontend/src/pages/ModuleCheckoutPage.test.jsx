import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ModuleCheckoutPage from "./ModuleCheckoutPage.jsx";
import {
  SCIENCE_SEASON_MODULE,
  VLOG_SEASON_MODULE,
} from "./Homepage/homeShared.js";

const mocks = vi.hoisted(() => ({
  fetchPurchaseOffers: vi.fn(),
  fetchCouponChoices: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../api/payments/alipay.js", () => ({
  fetchPurchaseOffers: mocks.fetchPurchaseOffers,
  createAlipayPurchase: vi.fn(),
  savePendingPaymentContext: vi.fn(),
}));
vi.mock("../api/coupons.js", () => ({ fetchCouponChoices: mocks.fetchCouponChoices }));
vi.mock("../api/auth/useAuth.js", () => ({ useAuth: mocks.useAuth }));
vi.mock("sweetalert2", () => ({ default: { fire: vi.fn() } }));

function renderCheckout(moduleId) {
  return render(
    <MemoryRouter initialEntries={[`/modules/${moduleId}/purchase`]}>
      <Routes>
        <Route path="/modules/:moduleId/purchase" element={<ModuleCheckoutPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModuleCheckoutPage", () => {
  beforeEach(() => {
    mocks.fetchPurchaseOffers.mockReset();
    mocks.fetchCouponChoices.mockReset();
    mocks.useAuth.mockReturnValue({
      user: null,
      loading: false,
      isAuthenticated: false,
      reloadMe: vi.fn(),
    });
  });

  it.each([
    {
      module: SCIENCE_SEASON_MODULE,
      description: "解锁科普季全部正式学习内容。",
    },
    {
      module: VLOG_SEASON_MODULE,
      description: "解锁 Vlog季全部正式学习内容。",
    },
  ])("shows permanent $module.title copy and the purchase-modal features", async ({ module, description }) => {
    mocks.fetchPurchaseOffers.mockResolvedValue([{
      code: `${module.id}-lifetime`,
      title: "Lifetime",
      plan_label: "Lifetime",
      access_duration_days: null,
      estimated_expires_at: null,
      description: "API description",
      price_amount: "69.90",
      original_price_amount: "69.90",
      final_price_amount: "69.90",
    }]);

    renderCheckout(module.id);

    const offer = await screen.findByRole("article");
    expect(within(offer).getByRole("heading", { name: module.title })).toBeInTheDocument();
    expect(within(offer).getByText("终生有效")).toBeInTheDocument();
    expect(within(offer).getByText(description)).toBeInTheDocument();
    module.purchaseFeatures.forEach((feature) => {
      expect(within(offer).getByText(feature)).toBeInTheDocument();
    });
    expect(screen.getByText("科普季与 Vlog 季需分别购买，购买后终生有效。")).toBeInTheDocument();
    expect(screen.queryByText("Lifetime")).not.toBeInTheDocument();
    expect(screen.queryByText("登录后显示预计到期时间")).not.toBeInTheDocument();
    expect(screen.queryByText(/预计有效至/)).not.toBeInTheDocument();
  });

  it("keeps the timed validity copy for exam preparation", async () => {
    mocks.fetchPurchaseOffers.mockResolvedValue([{
      code: "exam-preparation-30-days",
      title: "备考季 30 天",
      plan_label: "30 天",
      access_duration_days: 30,
      estimated_expires_at: null,
      price_amount: "99.90",
      original_price_amount: "99.90",
      final_price_amount: "99.90",
    }]);

    renderCheckout("exam-preparation");

    const offer = await screen.findByRole("article");
    expect(within(offer).getByText("30 天有效")).toBeInTheDocument();
    expect(within(offer).getByText("登录后显示预计到期时间")).toBeInTheDocument();
  });

});
