import { describe, expect, it } from "vitest";
import {
  examPreparationFavoriteQuery,
  examPreparationPurchasePath,
  examPreparationReturnPath,
  examPreparationScope,
  examPreparationScopeFromSearchParams,
} from "./examPreparationScope.js";

describe("examPreparationScope", () => {
  it.each([
    ["b1", { examType: "TELC", level: "B1", levelPath: "b1" }],
    ["B2", { examType: "TELC", level: "B2", levelPath: "b2" }],
    ["c1", { examType: "TELC", level: "C1", levelPath: "c1" }],
  ])("normalizes %s to the API and path scope", (level, expected) => {
    expect(examPreparationScope(level)).toEqual(expected);
  });

  it.each([undefined, "", "b3", "telc/b1"])("rejects invalid level %s", (level) => {
    expect(examPreparationScope(level)).toBeNull();
  });

  it("reads only a supported TELC level from favorite query params", () => {
    expect(examPreparationScopeFromSearchParams(new URLSearchParams("exam_type=TELC&level=B2")))
      .toEqual({ examType: "TELC", level: "B2", levelPath: "b2" });
    expect(examPreparationScopeFromSearchParams(new URLSearchParams("exam_type=GOETHE&level=B2")))
      .toBeNull();
    expect(examPreparationScopeFromSearchParams(new URLSearchParams("exam_type=TELC&level=B3")))
      .toBeNull();
  });

  it("builds a scoped favorite query and purchase return path", () => {
    const scope = examPreparationScope("b1");
    expect(examPreparationFavoriteQuery(scope)).toBe("exam_type=TELC&level=B1");
    expect(examPreparationPurchasePath(scope))
      .toBe("/modules/exam-preparation/purchase?return_to=%2Fmodules%2Fexam-preparation%2Fb1");
    expect(examPreparationPurchasePath(null)).toBe("/modules/exam-preparation/purchase");
    expect(examPreparationPurchasePath({ examType: "GOETHE", level: "B1" }))
      .toBe("/modules/exam-preparation/purchase");
  });

  it("accepts only exact level-home return paths", () => {
    expect(examPreparationReturnPath("/modules/exam-preparation/b2", "/modules/exam-preparation"))
      .toBe("/modules/exam-preparation/b2");
    expect(examPreparationReturnPath("/modules/exam-preparation/c1", "/modules/exam-preparation"))
      .toBe("/modules/exam-preparation/c1");
    expect(examPreparationReturnPath("https://evil.example/", "/modules/exam-preparation"))
      .toBe("/modules/exam-preparation");
    expect(examPreparationReturnPath("/modules/exam-preparation/b2?x=1", "/modules/exam-preparation"))
      .toBe("/modules/exam-preparation");
  });
});
