import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ModuleCheckoutPage from "./ModuleCheckoutPage.jsx";
import {
  SCIENCE_SEASON_MODULE,
  VLOG_SEASON_MODULE,
} from "./Homepage/homeShared.js";
import { hasModuleAccess } from "../utils/moduleAccess.js";

const mocks = vi.hoisted(() => ({
  fetchPurchaseOffers: vi.fn(),
  fetchCouponChoices: vi.fn(),
  createAlipayPurchase: vi.fn(),
  useAuth: vi.fn(),
  redeemCode: vi.fn(),
  swalFire: vi.fn(),
}));

vi.mock("../api/payments/alipay.js", () => ({
  fetchPurchaseOffers: mocks.fetchPurchaseOffers,
  createAlipayPurchase: mocks.createAlipayPurchase,
  savePendingPaymentContext: vi.fn(),
}));
vi.mock("../api/coupons.js", () => ({ fetchCouponChoices: mocks.fetchCouponChoices }));
vi.mock("../api/auth/auth.js", () => ({ redeemCode: mocks.redeemCode }));
vi.mock("../api/auth/useAuth.js", () => ({ useAuth: mocks.useAuth }));
vi.mock("sweetalert2", () => ({ default: { fire: mocks.swalFire } }));

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
  afterEach(() => {
    delete HTMLElement.prototype.scrollIntoView;
  });

  beforeEach(() => {
    mocks.fetchPurchaseOffers.mockReset();
    mocks.fetchCouponChoices.mockReset();
    mocks.createAlipayPurchase.mockReset();
    mocks.redeemCode.mockReset();
    mocks.swalFire.mockReset();
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

  it("focuses and scrolls to redemption once when redeem=1 is requested", async () => {
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices.mockResolvedValue({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "99" } });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    renderCheckout(SCIENCE_SEASON_MODULE.id, "?redeem=1");

    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toHaveFocus());

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it("does not focus or scroll to redemption without redeem=1", async () => {
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices.mockResolvedValue({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "99" } });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    renderCheckout(SCIENCE_SEASON_MODULE.id);

    const input = await screen.findByRole("textbox");
    await waitFor(() => expect(input).toBeInTheDocument());

    expect(input).not.toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([SCIENCE_SEASON_MODULE, { id: "exam-preparation", title: "备考季" }])(
    "places code redemption after offers for authenticated $id",
    async (module) => {
      mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
      mocks.fetchPurchaseOffers.mockResolvedValue([{ code: `${module.id}-offer`, title: "方案", price_amount: "99" }]);
      mocks.fetchCouponChoices.mockResolvedValue({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "99" } });
      renderCheckout(module.id);
      await screen.findByRole("article");
      const input = screen.getByRole("textbox", { name: "激活码、优惠码或推广码" });
      expect(input.closest("article")).toBeNull();
      const offerList = input.closest(".module-checkout-page").querySelector(".module-checkout-page__offer-list");
      expect(offerList.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const redemption = input.closest(".checkout-code-redemption");
      const footer = input.closest(".module-checkout-page").querySelector(".module-checkout-page__footer-row");
      expect(redemption.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    },
  );

  it("refreshes choices after redemption and sends the applicable coupon selection to payment", async () => {
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices
      .mockResolvedValueOnce({ choices: [{ coupon: { id: 2 }, is_applicable: true, pricing: { final_amount: "80" } }], default_coupon_id: 2 })
      .mockResolvedValueOnce({ choices: [{ coupon: { id: 2 }, is_applicable: true, pricing: { final_amount: "80" } }, { coupon: { id: 9 }, is_applicable: true, pricing: { final_amount: "70" } }], default_coupon_id: 2 });
    mocks.redeemCode.mockResolvedValue({ type: "promotion", outcome: "issued", coupon: { id: 9 } });
    mocks.createAlipayPurchase.mockRejectedValue({ status: 500, message: "stop" });
    renderCheckout(SCIENCE_SEASON_MODULE.id);
    const offer = await screen.findByRole("article");
    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "SAVE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(mocks.fetchCouponChoices).toHaveBeenCalledTimes(2));
    expect(await within(offer).findByText("¥70")).toBeInTheDocument();
    fireEvent.click(within(offer).getByRole("button", { name: "去支付宝支付" }));
    await waitFor(() => expect(mocks.createAlipayPurchase).toHaveBeenCalledWith({ offerCode: "science-offer", couponId: 9, useCoupon: true }));
  });

  it("keeps the prior coupon selection and explains when a newly issued coupon does not apply", async () => {
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices
      .mockResolvedValueOnce({ choices: [{ coupon: { id: 2 }, is_applicable: true, pricing: { final_amount: "80" } }], default_coupon_id: 2 })
      .mockResolvedValueOnce({ choices: [{ coupon: { id: 2 }, is_applicable: true, pricing: { final_amount: "80" } }, { coupon: { id: 9 }, is_applicable: false }], default_coupon_id: 2 });
    mocks.redeemCode.mockResolvedValue({ type: "promotion", outcome: "issued", coupon: { id: 9 } });
    renderCheckout(SCIENCE_SEASON_MODULE.id);
    const offer = await screen.findByRole("article");
    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "SAVE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: "已领取，但不适用于当前方案，可在其他适用购买页使用" })));
    expect(within(offer).getByText("¥80")).toBeInTheDocument();
  });

  it("refreshes every offer after redemption and selects the new coupon only where applicable", async () => {
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
    mocks.fetchPurchaseOffers.mockResolvedValue([
      { code: "first-offer", title: "第一方案", price_amount: "100" },
      { code: "second-offer", title: "第二方案", price_amount: "120" },
    ]);
    const firstInitial = {
      choices: [{ coupon: { id: 11, display_name: "第一方案旧券", discount_amount: "20" }, is_applicable: true, pricing: { final_amount: "80" } }],
      default_coupon_id: 11,
      available_count: 1,
      no_coupon_pricing: { final_amount: "100" },
    };
    const secondInitial = {
      choices: [{ coupon: { id: 22, display_name: "第二方案券", discount_amount: "30" }, is_applicable: true, pricing: { final_amount: "90" } }],
      default_coupon_id: 22,
      available_count: 1,
      no_coupon_pricing: { final_amount: "120" },
    };
    const firstRefreshed = {
      ...firstInitial,
      choices: [
        ...firstInitial.choices,
        { coupon: { id: 33, display_name: "新第一方案券", discount_amount: "40" }, is_applicable: true, pricing: { final_amount: "60" } },
      ],
    };
    const secondRefreshed = {
      ...secondInitial,
      choices: [
        ...secondInitial.choices,
        { coupon: { id: 33, display_name: "新第一方案券", discount_amount: "40" }, is_applicable: false, pricing: null },
      ],
    };
    mocks.fetchCouponChoices
      .mockResolvedValueOnce(firstInitial)
      .mockResolvedValueOnce(secondInitial)
      .mockResolvedValueOnce(firstRefreshed)
      .mockResolvedValueOnce(secondRefreshed);
    mocks.redeemCode.mockResolvedValue({ type: "promotion", outcome: "issued", coupon: { id: 33 } });
    mocks.createAlipayPurchase.mockRejectedValue({ status: 500, message: "stop" });

    renderCheckout(SCIENCE_SEASON_MODULE.id);
    const [firstOffer, secondOffer] = await screen.findAllByRole("article");
    expect(screen.getAllByRole("textbox", { name: "激活码、优惠码或推广码" })).toHaveLength(1);
    expect(screen.getByRole("textbox").closest("article")).toBeNull();
    expect(mocks.fetchCouponChoices).toHaveBeenNthCalledWith(1, "first-offer");
    expect(mocks.fetchCouponChoices).toHaveBeenNthCalledWith(2, "second-offer");
    expect(within(firstOffer).getByText("¥80")).toBeInTheDocument();
    expect(within(secondOffer).getByText("¥90")).toBeInTheDocument();

    fireEvent.click(within(secondOffer).getByRole("button", { name: /优惠券/ }));
    fireEvent.click(await screen.findByRole("button", { name: /第二方案券/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "FIRST" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(mocks.fetchCouponChoices).toHaveBeenCalledTimes(4));
    expect(mocks.fetchCouponChoices).toHaveBeenNthCalledWith(3, "first-offer");
    expect(mocks.fetchCouponChoices).toHaveBeenNthCalledWith(4, "second-offer");
    expect(within(firstOffer).getByText("¥60")).toBeInTheDocument();
    expect(within(secondOffer).getByText("¥90")).toBeInTheDocument();
    fireEvent.click(within(secondOffer).getByRole("button", { name: /优惠券/ }));
    expect(await screen.findByRole("button", { name: /第二方案券/ })).toHaveClass("is-selected");
    fireEvent.click(screen.getByRole("button", { name: "关闭优惠券选择" }));

    fireEvent.click(within(firstOffer).getByRole("button", { name: "去支付宝支付" }));
    await waitFor(() => expect(mocks.createAlipayPurchase).toHaveBeenCalledWith({ offerCode: "first-offer", couponId: 33, useCoupon: true }));
    await waitFor(() => expect(within(secondOffer).getByRole("button", { name: "去支付宝支付" })).toBeEnabled());
    fireEvent.click(within(secondOffer).getByRole("button", { name: "去支付宝支付" }));
    await waitFor(() => expect(mocks.createAlipayPurchase).toHaveBeenCalledWith({ offerCode: "second-offer", couponId: 22, useCoupon: true }));
  });

  it("reports partial coupon refresh failure while keeping successful applicable updates", async () => {
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe: vi.fn() });
    mocks.fetchPurchaseOffers.mockResolvedValue([
      { code: "first-offer", title: "第一方案", price_amount: "100" },
      { code: "second-offer", title: "第二方案", price_amount: "120" },
    ]);
    mocks.fetchCouponChoices
      .mockResolvedValueOnce({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "100" } })
      .mockResolvedValueOnce({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "120" } })
      .mockResolvedValueOnce({
        choices: [{ coupon: { id: 33 }, is_applicable: true, pricing: { final_amount: "60" } }],
        default_coupon_id: null,
        no_coupon_pricing: { final_amount: "100" },
      })
      .mockRejectedValueOnce(new Error("Refresh failed"));
    mocks.redeemCode.mockResolvedValue({ type: "promotion", outcome: "issued", coupon: { id: 33 } });
    renderCheckout(SCIENCE_SEASON_MODULE.id);
    const [firstOffer] = await screen.findAllByRole("article");

    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "SAVE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("优惠券已领取，但页面刷新失败，请刷新页面查看。");
    expect(mocks.redeemCode).toHaveBeenCalledOnce();
    expect(mocks.fetchCouponChoices).toHaveBeenCalledTimes(4);
    expect(within(firstOffer).getByText("¥60")).toBeInTheDocument();
    expect(mocks.swalFire).not.toHaveBeenCalled();
  });

  it.each([
    ["science-season", SCIENCE_SEASON_MODULE, { entitlements: [{ status: "active", module: { key: SCIENCE_SEASON_MODULE.moduleKey } }] }, SCIENCE_SEASON_MODULE.route],
    ["platform", SCIENCE_SEASON_MODULE, { entitlements: [{ status: "active", scope: "platform" }] }, SCIENCE_SEASON_MODULE.route],
  ])("leaves checkout after redeeming access to %s", async (_name, module, latestUser, expectedRoute) => {
    const reloadMe = vi.fn().mockResolvedValue(latestUser);
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices.mockResolvedValue({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "99" } });
    mocks.redeemCode.mockResolvedValue({ type: "activation", entitlements: [] });
    renderCheckout(module.id);
    await screen.findByRole("article");
    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "ACT" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe(expectedRoute));
    expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ icon: "success" }));
  });

  it("stays on checkout when activation grants another module", async () => {
    const latestUser = {
      entitlements: [{
        status: "active",
        module: { key: "learning_by_video" },
        season: { season_number: 4 },
      }],
    };
    const reloadMe = vi.fn().mockResolvedValue(latestUser);
    expect(hasModuleAccess(latestUser, SCIENCE_SEASON_MODULE)).toBe(false);
    expect(hasModuleAccess(await reloadMe(), SCIENCE_SEASON_MODULE)).toBe(false);
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices.mockResolvedValue({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "99" } });
    mocks.redeemCode.mockResolvedValue({ type: "activation", entitlements: [] });
    renderCheckout(SCIENCE_SEASON_MODULE.id);
    await screen.findByRole("article");
    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "ACT" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    await waitFor(() => expect(mocks.swalFire).toHaveBeenCalledWith(expect.objectContaining({ text: "已激活其他内容。" })));
    expect(screen.getByTestId("location").textContent).toBe("/modules/science-season/purchase");
  });

  it("reports a refresh failure when an applied activation cannot reload the user", async () => {
    const reloadMe = vi.fn().mockResolvedValue(null);
    mocks.useAuth.mockReturnValue({ user: { entitlements: [] }, loading: false, isAuthenticated: true, reloadMe });
    mocks.fetchPurchaseOffers.mockResolvedValue([{ code: "science-offer", title: "方案", price_amount: "99" }]);
    mocks.fetchCouponChoices.mockResolvedValue({ choices: [], default_coupon_id: null, no_coupon_pricing: { final_amount: "99" } });
    mocks.redeemCode.mockResolvedValue({ type: "activation", entitlements: [] });
    renderCheckout(SCIENCE_SEASON_MODULE.id);
    await screen.findByRole("article");
    fireEvent.change(screen.getByRole("textbox", { name: "激活码、优惠码或推广码" }), { target: { value: "ACT" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("权限已激活，但页面刷新失败，请刷新页面查看。");
    expect(screen.queryByText("已激活其他内容。")).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("/modules/science-season/purchase");
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
