import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GuideMarkdown from "./GuideMarkdown.jsx";

describe("GuideMarkdown", () => {
  it("renders imported multiline table rows as one GFM table", () => {
    const importedMarkdown = [
      "| **陷阱类型** | **设坑手段** | **示例（虚拟）** | **识别与破解方法** |",
      "| --- | --- | --- | --- |",
      "| 反义颠倒",
      "",
      "(Das Gegenteil) | 结论直接反转 | *Text:* Immer weniger Jugendliche rauchen.",
      "",
      "*Überschrift:* „Rauchen nimmt stark zu“ | 确认论述方向与发展趋势是否一致。 |",
      "| 限定词掉包",
      "",
      "(Kleine Wörter) | 数量词改变句意 | *Text:* Die meisten Gäste sind zufrieden.",
      "",
      "*Überschrift:* „Kaum ein Gast ist zufrieden“ | 核对限定词。 |",
    ].join("\n");

    render(<GuideMarkdown>{importedMarkdown}</GuideMarkdown>);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole("cell", { name: /反义颠倒.*Das Gegenteil/ })).toBeInTheDocument();
    expect(within(rows[1]).getByRole("cell", { name: /Rauchen nimmt stark zu/ })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("cell", { name: /限定词掉包.*Kleine Wörter/ })).toBeInTheDocument();
  });
});
