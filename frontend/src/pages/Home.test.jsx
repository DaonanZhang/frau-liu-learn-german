import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ navigate: vi.fn() }));

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

import Home from "./Home.jsx";

describe("Home invitation modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.useAuth.mockReturnValue({ user: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the invitation modal and key rewards", () => {
    render(<Home />);

    expect(screen.getByRole("dialog", { name: /邀请有礼功能正式上线/ })).toHaveAttribute("aria-modal", "true");
    expect(screen.queryByRole("region", { name: /邀请有礼/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "🎁 好友专属优惠" }).closest("section")).toHaveTextContent("立减 5 元 优惠");
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
