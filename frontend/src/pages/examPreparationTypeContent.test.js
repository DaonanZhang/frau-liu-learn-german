import { describe, expect, it } from "vitest";

import {
  LISTENING_TYPES,
  READING_TYPES,
  examPreparationTypeDescription,
} from "./examPreparationTypeContent.js";

describe("TELC B2 exam preparation entry copy", () => {
  it("uses the B2 listening descriptions without changing B1", () => {
    expect(examPreparationTypeDescription(LISTENING_TYPES[0], "B2")).toBe(
      "听一段新闻，录音播放一次，判断 5 个陈述句的正误。共 5 道正误判断题。",
    );
    expect(examPreparationTypeDescription(LISTENING_TYPES[1], "B2")).toBe(
      "听一段较长的访谈，录音播放一次，判断 10 个陈述句的正误。共 10 道正误判断题。",
    );
    expect(examPreparationTypeDescription(LISTENING_TYPES[1], "B1")).toContain("录音播放两次");
  });

  it("uses the B2 Lesen Teil 3 description without changing B1", () => {
    expect(examPreparationTypeDescription(READING_TYPES[2], "B2")).toBe(
      "阅读 12 个简短的宣传文字，为 10 种具体生活情境匹配对应的文章。共 10 道配对题。",
    );
    expect(examPreparationTypeDescription(READING_TYPES[2], "B1")).toContain("分类广告");
  });
});
