import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RecoverPhonePage from "./RecoverPhonePage.jsx";

const mocks = vi.hoisted(() => ({ requestPhoneRecovery: vi.fn() }));

vi.mock("../api/auth/auth", () => ({
  requestPhoneRecovery: mocks.requestPhoneRecovery,
}));
vi.mock("../components/SiteFooter", () => ({ default: () => <footer>Site footer</footer> }));

describe("RecoverPhonePage", () => {
  beforeEach(() => {
    mocks.requestPhoneRecovery.mockReset().mockResolvedValue({ ok: true });
  });

  it("submits a normalized email and keeps an accessible success state", async () => {
    let resolveRequest;
    mocks.requestPhoneRecovery.mockImplementation(
      () => new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    render(
      <MemoryRouter initialEntries={["/recover-phone"]}>
        <RecoverPhonePage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText("绑定邮箱");
    expect(emailInput).toHaveAttribute("id", "recover-phone-email");
    expect(emailInput).toHaveAttribute("aria-describedby", "recover-phone-email-hint");
    expect(screen.getByText("请输入注册账号时绑定的邮箱。")).toHaveAttribute(
      "id",
      "recover-phone-email-hint"
    );

    const submit = screen.getByRole("button", { name: "发送注册手机号" });
    expect(submit).toBeDisabled();

    fireEvent.change(emailInput, {
      target: { value: "  Learner@Example.com  " },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(screen.getByRole("button", { name: "发送中..." })).toBeDisabled();

    resolveRequest({ ok: true });

    expect(mocks.requestPhoneRecovery).toHaveBeenCalledWith("learner@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "注册手机号已发送至 learner@example.com。"
    );
    expect(screen.getByRole("link", { name: "返回登录" })).toHaveAttribute("href", "/login");

    fireEvent.click(screen.getByRole("button", { name: "更换邮箱" }));
    expect(screen.getByLabelText("绑定邮箱")).toHaveValue("");
  });
});
