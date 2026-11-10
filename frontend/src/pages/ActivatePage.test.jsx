import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ActivatePage from "./ActivatePage.jsx";

const mocks = vi.hoisted(() => ({ registerUser: vi.fn() }));
const authStyles = readFileSync(resolve("src/styles/auth.css"), "utf8");

vi.mock("../api/auth/auth", () => ({ registerUser: mocks.registerUser }));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer>Site footer</footer> }));

function renderPage() {
  return render(
    <>
      <style>{authStyles}</style>
      <MemoryRouter initialEntries={["/activate"]}>
        <ActivatePage />
      </MemoryRouter>
    </>
  );
}

function fillValidRegistrationFields() {
  fireEvent.change(screen.getByPlaceholderText("请输入11位手机号"), {
    target: { value: "13800138000" },
  });
  fireEvent.change(screen.getByPlaceholderText("请输入邮箱"), {
    target: { value: "learner@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("请输入至少6位密码"), {
    target: { value: "secret1" },
  });
}

describe("ActivatePage legal consent", () => {
  beforeEach(() => {
    mocks.registerUser.mockReset().mockResolvedValue({ ok: false });
  });

  it("blocks registration until the user actively accepts both legal documents", async () => {
    renderPage();
    fillValidRegistrationFields();

    const registerButton = screen.getByRole("button", { name: "立即注册" });
    expect(registerButton).toBeDisabled();
    fireEvent.click(registerButton);
    expect(mocks.registerUser).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "我已阅读并同意本用户协议及隐私政策" })
    );
    expect(registerButton).toBeEnabled();
    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(mocks.registerUser).toHaveBeenCalledOnce();
    });
    expect(mocks.registerUser).toHaveBeenCalledWith({
      telephone: "13800138000",
      countryCode: "+86",
      email: "learner@example.com",
      password: "secret1",
    });
  });

  it("opens both documents without changing the user's consent choice", () => {
    renderPage();

    const checkbox = screen.getByRole("checkbox", {
      name: "我已阅读并同意本用户协议及隐私政策",
    });
    const termsButton = screen.getByRole("button", { name: "本用户协议" });
    const privacyButton = screen.getByRole("button", { name: "隐私政策" });
    expect(checkbox).not.toBeChecked();
    expect(termsButton).toHaveAttribute("type", "button");
    expect(privacyButton).toHaveAttribute("type", "button");

    termsButton.focus();
    fireEvent.click(termsButton);
    const termsDialog = screen.getByRole("dialog", {
      name: "符号刘的德语资料库 用户服务协议",
    });
    expect(termsDialog).toBeInTheDocument();
    expect(termsDialog.closest(".auth-card")).toBeNull();
    expect(termsDialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: "关闭用户服务协议" })).toHaveFocus();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "关闭用户服务协议" }));
    expect(termsButton).toHaveFocus();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(privacyButton);
    expect(
      screen.getByRole("dialog", { name: "符号刘的德语资料库 隐私政策" })
    ).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it("gives the associated consent label a mobile-sized touch target", () => {
    renderPage();
    const consentLabel = screen.getByText("我已阅读并同意").closest("label");
    expect(getComputedStyle(consentLabel).minHeight).toBe("44px");
  });
});
