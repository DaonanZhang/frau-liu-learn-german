import Swal from "sweetalert2";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmMockExamAction } from "./confirmMockExamAction.js";

vi.mock("sweetalert2", () => ({ default: { fire: vi.fn() } }));

describe("confirmMockExamAction", () => {
  beforeEach(() => Swal.fire.mockReset());

  it("uses a SweetAlert confirmation dialog and returns its decision", async () => {
    Swal.fire.mockResolvedValue({ isConfirmed: true });

    await expect(confirmMockExamAction("结束阅读", "进入后不能返回修改阅读答案。"))
      .resolves.toBe(true);

    expect(Swal.fire).toHaveBeenCalledWith({
      icon: "warning",
      title: "结束阅读",
      text: "进入后不能返回修改阅读答案。",
      showCancelButton: true,
      confirmButtonText: "继续",
      cancelButtonText: "取消",
      reverseButtons: true,
    });
  });

  it("returns false when the dialog is cancelled", async () => {
    Swal.fire.mockResolvedValue({ isConfirmed: false });

    await expect(confirmMockExamAction("提前交卷", "未作答题目会按错误计算。"))
      .resolves.toBe(false);
  });
});
