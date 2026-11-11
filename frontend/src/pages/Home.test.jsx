import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
const paymentMocks = vi.hoisted(() => ({
  fetch: vi.fn(), resume: vi.fn(), cancel: vi.fn(), saveContext: vi.fn(),
}));

vi.mock("../api/auth/useAuth.js", () => ({ useAuth: authMocks.useAuth }));
vi.mock("../api/user_data/userData", () => ({
  markDailyActiveAndGetUserData: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../api/learning_by_video/userData", () => ({
  fetchLearningVideoUserData: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => navigationMocks.navigate };
});
vi.mock("../hooks/useMaxWidth.js", () => ({ default: () => false }));
vi.mock("../hooks/useBodyScrollLock", () => ({ default: vi.fn() }));
vi.mock("./Homepage/HomeSidebarContent.jsx", () => ({ default: () => <aside /> }));
vi.mock("sweetalert2", () => ({ default: { fire: vi.fn() } }));
vi.mock("../api/payments/alipay.js", () => ({
  fetchPendingAlipayPayments: paymentMocks.fetch,
  resumePendingAlipayPayment: paymentMocks.resume,
  cancelPendingAlipayPayment: paymentMocks.cancel,
  savePendingPaymentContext: paymentMocks.saveContext,
}));

import Home from "./Home.jsx";
import Swal from "sweetalert2";

describe("Home invitation modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.useAuth.mockReturnValue({ user: null });
    paymentMocks.fetch.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the invitation modal and key rewards", () => {
    render(<Home />);

    expect(screen.getByRole("dialog", { name: /邀请有礼功能正式上线/ })).toHaveAttribute("aria-modal", "true");
    expect(screen.queryByRole("region", { name: /邀请有礼/ })).not.toBeInTheDocument();
    const friendOffer = screen.getByRole("heading", { name: "🎁 好友专属优惠" }).closest("section");
    expect(friendOffer).toHaveTextContent("只要好友作为网站备考季新用户使用你的专属分享码下单备考季");
    expect(friendOffer).toHaveTextContent("立减 5 元 优惠");
    expect(screen.getByText(/推荐 1 人/)).toBeInTheDocument();
    expect(screen.getByText(/推荐 3 人/)).toBeInTheDocument();
    expect(screen.getByText(/推荐 5 人/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "www.frauliu.com" })).toHaveAttribute(
      "href",
      "https://www.frauliu.com",
    );
    expect(screen.getByRole("link", { name: "www.frauliu.cn" })).toHaveAttribute(
      "href",
      "https://www.frauliu.cn",
    );
  });

  it("loads and displays pending orders for a signed-in user", async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 7 } });
    paymentMocks.fetch.mockResolvedValue([{
      merchant_order_no: "order-1", subject: "科普季", amount: "19.90", payment_expires_at: "2026-11-11T12:00:00Z",
    }]);

    render(<Home />);

    const heading = await screen.findByRole("heading", { name: "待支付订单" });
    expect(heading).toBeInTheDocument();
    expect(heading.closest(".home-pending-orders").nextElementSibling).toHaveClass("home-layout");
    expect(screen.getByLabelText("1 笔订单")).toHaveTextContent("1");
    expect(document.querySelector(".home-pending-orders__item strong")).toHaveTextContent("科普季");
    expect(screen.getByText(/¥19.90/)).toBeInTheDocument();
    expect(screen.getByText(/有效至/)).toBeInTheDocument();
    expect(paymentMocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not request pending orders for an anonymous user", () => {
    render(<Home />);
    expect(paymentMocks.fetch).not.toHaveBeenCalled();
  });

  it("resumes a pending order, saves return context, and redirects to Alipay", async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 7 } });
    paymentMocks.fetch.mockResolvedValue([{
      merchant_order_no: "order-1", subject: "科普季", amount: "19.90",
    }]);
    paymentMocks.resume.mockResolvedValue({ pay_url: "https://alipay.test/pay", already_paid: false });
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/", assign });

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "继续支付" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://alipay.test/pay"));
    expect(paymentMocks.resume).toHaveBeenCalledWith("order-1");
    expect(paymentMocks.saveContext).toHaveBeenCalledWith("order-1", { returnPath: "/" });
  });

  it("confirms cancellation and removes the closed order", async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 7 } });
    paymentMocks.fetch.mockResolvedValue([{
      merchant_order_no: "order-1", subject: "科普季", amount: "19.90",
    }]);
    Swal.fire.mockResolvedValue({ isConfirmed: true });
    paymentMocks.cancel.mockResolvedValue({ status: "closed", already_paid: false });

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "取消订单" }));

    await waitFor(() => expect(paymentMocks.cancel).toHaveBeenCalledWith("order-1"));
    expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({
      title: "取消待支付订单？", showCancelButton: true,
    }));
    await waitFor(() => expect(document.querySelector(".home-pending-orders__item")).not.toBeInTheDocument());
  });

  it("shows TELC B1, B2, and C1 HS on the exam preparation card", () => {
    render(<Home />);

    expect(screen.getByText("TELC B1、B2、C1 HS 听说读写全真训练")).toBeInTheDocument();
    expect(screen.getByText("TELC B1、B2、C1 HS")).toBeInTheDocument();
  });

  it("hides the modal for the current mount when closed", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "关闭邀请有礼弹窗" }));

    expect(screen.queryByRole("dialog", { name: /邀请有礼功能正式上线/ })).not.toBeInTheDocument();
  });

  it("opens the profile referral section from the primary action", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "立即前往获取" }));

    expect(navigationMocks.navigate).toHaveBeenCalledWith("/profile#referral-campaign");
    expect(screen.queryByRole("dialog", { name: /邀请有礼功能正式上线/ })).not.toBeInTheDocument();
  });

  it("shows the modal again after Home is unmounted and mounted again", () => {
    const first = render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "关闭邀请有礼弹窗" }));
    first.unmount();

    render(<Home />);

    expect(screen.getByRole("dialog", { name: /邀请有礼功能正式上线/ })).toBeInTheDocument();
  });
});
