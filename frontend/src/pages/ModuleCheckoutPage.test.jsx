import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ModuleCheckoutPage from "./ModuleCheckoutPage.jsx";
import {
  SCIENCE_SEASON_MODULE,
  VLOG_SEASON_MODULE,
} from "./Homepage/homeShared.js";

const mocks = vi.hoisted(() => ({
  fetchPurchaseOffers: vi.fn(),
  fetchCouponChoices: vi.fn(),
  createAlipayPurchase: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("../api/payments/alipay.js", () => ({
  fetchPurchaseOffers: mocks.fetchPurchaseOffers,
  createAlipayPurchase: mocks.createAlipayPurchase,
  savePendingPaymentContext: vi.fn(),
}));
vi.mock("../api/coupons.js", () => ({ fetchCouponChoices: mocks.fetchCouponChoices }));
vi.mock("../api/auth/useAuth.js", () => ({ useAuth: mocks.useAuth }));
vi.mock("sweetalert2", () => ({ default: { fire: vi.fn() } }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderCheckout(moduleId, search = "") {
  return render(
    <MemoryRouter initialEntries={[`/modules/${moduleId}/purchase${search}`]}>
      <Routes>
        <Route path="/modules/:moduleId/purchase" element={<><ModuleCheckoutPage /><LocationProbe /></>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModuleCheckoutPage", () => {
  beforeEach(() => {
    mocks.fetchPurchaseOffers.mockReset();
    mocks.fetchCouponChoices.mockReset();
    mocks.createAlipayPurchase.mockReset();
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

  it("shows the backend response body when Alipay order creation fails", async () => {
    mocks.useAuth.mockReturnValue({
      user: { entitlements: [] },
      loading: false,
      isAuthenticated: true,
      reloadMe: vi.fn(),
    });
    mocks.fetchPurchaseOffers.mockResolvedValue([{
      code: "science-season-lifetime",
      title: "科普季终身版",
      plan_label: "终身",
      price_amount: "99.00",
      original_price_amount: "99.00",
      final_price_amount: "99.00",
    }]);
    mocks.fetchCouponChoices.mockResolvedValue({
      choices: [],
      default_coupon_id: null,
      no_coupon_pricing: { final_amount: "99.00" },
    });
    mocks.createAlipayPurchase.mockRejectedValue({
      status: 500,
      message: "API request failed: 500",
      data: {
        detail: "Database constraint failed",
        request_id: "debug-123",
      },
    });

    renderCheckout(SCIENCE_SEASON_MODULE.id);

    fireEvent.click(await screen.findByRole("button", { name: "去支付宝支付" }));

    const debug = await screen.findByRole("alert");
    expect(debug).toHaveTextContent("临时支付调试信息");
    expect(debug).toHaveTextContent("HTTP 500");
    expect(debug).toHaveTextContent("Database constraint failed");
    expect(debug).toHaveTextContent("debug-123");
    expect(screen.getByRole("button", { name: "去支付宝支付" })).toBeInTheDocument();
  });

  it.each([
    ["/modules/exam-preparation/b1", "/modules/exam-preparation/b1"],
    ["/modules/exam-preparation/b2", "/modules/exam-preparation/b2"],
  ])("returns free trial to the supported exam level home", async (returnTo, expectedPath) => {
    mocks.fetchPurchaseOffers.mockResolvedValue([]);
    renderCheckout("exam-preparation", `?return_to=${encodeURIComponent(returnTo)}`);

    fireEvent.click(await screen.findByRole("button", { name: "免费试用" }));
    expect(screen.getByTestId("location")).toHaveTextContent(expectedPath);
  });

  it("rejects an unsafe exam return path and falls back to the module route", async () => {
    mocks.fetchPurchaseOffers.mockResolvedValue([]);
    renderCheckout("exam-preparation", "?return_to=https%3A%2F%2Fevil.example%2F");

    fireEvent.click(await screen.findByRole("button", { name: "免费试用" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation");
  });

  it("keeps non-exam free trial behavior unchanged", async () => {
    mocks.fetchPurchaseOffers.mockResolvedValue([]);
    renderCheckout(SCIENCE_SEASON_MODULE.id);

    fireEvent.click(await screen.findByRole("button", { name: "立刻试用" }));
    expect(screen.getByTestId("location")).toHaveTextContent(SCIENCE_SEASON_MODULE.route);
  });

});
