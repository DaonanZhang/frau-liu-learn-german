import { describe, expect, it } from "vitest";

import { extractPreview } from "./ExamPreparationWritingPage.jsx";

describe("ExamPreparationWritingPage", () => {
  it("keeps list previews readable when stored text contains br tags", () => {
    expect(extractPreview("第一<br>第二<BR/>第三<br />第四<strong>重点</strong>"))
      .toBe("第一\n第二\n第三\n第四<strong>重点</strong>");
  });
});
