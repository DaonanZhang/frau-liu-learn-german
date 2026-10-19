import { describe, expect, it } from "vitest";

import { EXAM_PREPARATION_MODULE } from "./homeShared.js";

describe("exam preparation shared copy", () => {
  it("describes the currently available TELC B1 and B2 levels", () => {
    expect(EXAM_PREPARATION_MODULE.subtitle).toContain("TELC B1/B2");
    expect(EXAM_PREPARATION_MODULE.stats).toContain("TELC B1/B2");
    expect(EXAM_PREPARATION_MODULE.purchaseNotice).toContain("TELC B1 与 B2");
    expect(EXAM_PREPARATION_MODULE.purchaseNotice).not.toMatch(/只有\s*Telc\s*B1/i);
  });
});
