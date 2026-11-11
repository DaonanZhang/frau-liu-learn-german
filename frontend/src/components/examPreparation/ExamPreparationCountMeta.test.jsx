import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExamPreparationCountMeta from "./ExamPreparationCountMeta.jsx";

describe("ExamPreparationCountMeta", () => {
  it("shows zero and multiple statistics with independently styled values", () => {
    const { container } = render(
      <ExamPreparationCountMeta
        items={[
          { value: 0, label: "B1 题目" },
          { value: 12, label: "B2 题目" },
        ]}
      />,
    );

    const meta = screen.getByLabelText("0 B1 题目；12 B2 题目");
    expect(meta).toHaveClass("exam-preparation-count-meta");
    expect(meta).toHaveTextContent("0 B1 题目");
    expect(meta).toHaveTextContent("12 B2 题目");
    expect(container.querySelectorAll(".exam-preparation-count-meta__value")).toHaveLength(2);
    expect(container.querySelectorAll(".exam-preparation-count-meta__separator")).toHaveLength(1);
  });

  it("filters invalid items and renders nothing when none are valid", () => {
    const { container } = render(
      <ExamPreparationCountMeta
        items={[
          { value: Infinity, label: "无效数字" },
          { value: 4, label: "   " },
        ]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
