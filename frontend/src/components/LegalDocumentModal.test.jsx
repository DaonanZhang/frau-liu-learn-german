import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LegalDocumentModal from "./LegalDocumentModal.jsx";

describe("LegalDocumentModal", () => {
  it("shows the selected legal document without leaving the previous document behind", () => {
    const { rerender } = render(
      <LegalDocumentModal documentType="terms" onClose={vi.fn()} />
    );

    expect(
      screen.getByRole("heading", { name: "符号刘的德语资料库 用户服务协议", level: 2 })
    ).toBeInTheDocument();
    for (const section of [
      "1. 网站与服务提供者",
      "2. 服务内容与会员权益",
      "3. 素材来源、听力制作与免责声明",
      "4. 账号注册、设备管理与账号安全",
      "5. 虚拟商品购买、退款与活动规则",
      "6. 知识产权与内容使用边界",
      "7. 个人信息、协议变更与争议处理",
    ]) {
      expect(screen.getByRole("heading", { name: section })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("heading", { name: "符号刘的德语资料库 隐私政策" })
    ).not.toBeInTheDocument();

    rerender(<LegalDocumentModal documentType="privacy" onClose={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "符号刘的德语资料库 隐私政策", level: 2 })
    ).toBeInTheDocument();
    for (const section of [
      "一、我们收集哪些信息",
      "二、信息如何使用",
      "三、信息存储与保存期限",
      "四、信息共享",
      "五、您的权利",
      "六、安全措施",
      "七、未成年人隐私",
      "八、政策更新",
    ]) {
      expect(screen.getByRole("heading", { name: section })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("heading", { name: "符号刘的德语资料库 用户服务协议" })
    ).not.toBeInTheDocument();
  });

  it("keeps content clicks inside the dialog and closes from the overlay", () => {
    const onClose = vi.fn();
    render(<LegalDocumentModal documentType="terms" onClose={onClose} />);

    const body = document.querySelector(".legal-document-modal__body");
    const overlay = document.querySelector(".legal-document-modal__overlay");
    expect(body).toBeInTheDocument();

    fireEvent.click(body);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from the labelled close button and Escape key", () => {
    const onClose = vi.fn();
    render(<LegalDocumentModal documentType="privacy" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭隐私政策" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when no legal document is selected", () => {
    render(<LegalDocumentModal documentType={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus inside, traps Tab in both directions, and restores the opener", () => {
    const opener = document.createElement("button");
    opener.textContent = "打开协议";
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <LegalDocumentModal documentType="privacy" onClose={vi.fn()} />
    );
    const closeButton = screen.getByRole("button", { name: "关闭隐私政策" });
    const emailLink = screen.getByRole("link", { name: "contact@frauliu.com" });

    expect(closeButton).toHaveFocus();

    emailLink.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(emailLink).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
