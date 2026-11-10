import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SiteFooter from "./SiteFooter.jsx";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../api/auth", () => ({ useAuth: mocks.useAuth }));

describe("SiteFooter legal documents", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset().mockReturnValue({ isAuthenticated: false });
  });

  it("opens each legal document from its own footer entry without removing existing links", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("button", { name: "版权说明" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "皖ICP备2026004358号" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /皖公网安备/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "用户服务协议" }));
    expect(
      screen.getByRole("dialog", { name: "符号刘的德语资料库 用户服务协议" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "关闭用户服务协议" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const privacyButton = screen.getByRole("button", { name: "隐私政策" });
    privacyButton.focus();
    fireEvent.click(privacyButton);
    expect(
      screen.getByRole("dialog", { name: "符号刘的德语资料库 隐私政策" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "关闭隐私政策" })).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(privacyButton).toHaveFocus();
  });
});
