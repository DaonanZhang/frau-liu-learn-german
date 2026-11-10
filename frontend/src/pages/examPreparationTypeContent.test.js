import { describe, expect, it } from "vitest";

import {
  LISTENING_TYPES,
  READING_TYPES,
  SPEAKING_TYPES,
  SPRACHBAUSTEINE_TYPES,
  examPreparationTypeDescription,
  examPreparationTypesForLevel,
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

  it("maps C1 reading, speaking, and grammar cards to their TELC parts", () => {
    const c1Reading = examPreparationTypesForLevel(READING_TYPES, "C1");
    expect(c1Reading.map((item) => item.title)).toEqual(["Teil 1", "Teil 2", "Teil 3"]);
    expect(c1Reading.map((item) => item.key)).toEqual(["title-matching", "understanding", "ad-matching"]);
    expect(c1Reading.map((item) => item.to)).toEqual([
      "/modules/exam-preparation/lesen/cloze-matching",
      "/modules/exam-preparation/lesen/understanding",
      "/modules/exam-preparation/lesen/ad-matching",
    ]);
    const c1Speaking = examPreparationTypesForLevel(SPEAKING_TYPES, "C1");
    expect(c1Speaking.map((item) => item.title)).toEqual(["Teil 1a + Teil 1b", "Teil 2"]);
    expect(c1Speaking.map((item) => item.to)).toEqual([
      "/modules/exam-preparation/sprechen/teil-2",
      "/modules/exam-preparation/sprechen/teil-3",
    ]);
    expect(c1Speaking[0].description).toContain("主题展示");
    expect(c1Speaking[0].description).toContain("概述搭档的展示、提出追问");
    expect(c1Speaking[1].description).toContain("讨论引语");
    expect(examPreparationTypesForLevel(SPEAKING_TYPES, "B1")).toHaveLength(3);
    expect(examPreparationTypesForLevel(SPEAKING_TYPES, "B2")).toHaveLength(3);
    expect(examPreparationTypesForLevel(SPRACHBAUSTEINE_TYPES, "C1")).toHaveLength(1);
  });
});
