import { describe, expect, it } from "vitest";
import { answerMatchesExpected, expectedHasMultipleAnswers } from "./c1AnswerMatcher.js";

describe("C1 free text answer matching", () => {
  it.each([
    ["didaktische Spiele", "didaktische Spiele <or> therapeutische Spiele"],
    ["THERAPEUTISCHE SPIELE", "didaktische Spiele <or> therapeutische Spiele"],
    ["noch", "Bücher werden weiter(hin) <or> (immer) noch"],
    ["immer noch", "Bücher werden weiter(hin) <or> (immer) noch"],
    ["doppelsinnig;lustig", "doppelsinnig;lustig"],
    ["lustig; doppelsinnig", "doppelsinnig;lustig"],
    ["Theaterstücke; Lieder", "Lieder; Theater(stücke) <or> Stücke <or> Interviews;Hörspiele"],
    ["Theater; Theaterstücke", "Theater(stücke);Theater"],
    ["Stücke", "Lieder; Theater(stücke) <or> Stücke <or> Interviews;Hörspiele"],
    ["Literatur-Interpretationen", "(Literatur-)Interpretation(en)"],
    ["INTERPRETATION", "(Literatur-)Interpretation(en)"],
    ["Lernen", "Lernen"],
    ["LernEN!", "Lernen"],
  ])("accepts %s for %s", (actual, expected) => {
    expect(answerMatchesExpected(actual, expected)).toBe(true);
  });

  it.each([
    ["doppelsinnig", "doppelsinnig;lustig"],
    ["doppelsinnig;lustig;witzig", "doppelsinnig;lustig"],
    ["Lernens", "Lernen"],
    ["", "Lernen"],
    ["Lernen", ""],
  ])("rejects %s for %s", (actual, expected) => {
    expect(answerMatchesExpected(actual, expected)).toBe(false);
  });

  it("normalizes Unicode compatibility forms and surrounding punctuation", () => {
    expect(answerMatchesExpected("  ＬＥＲＮＥＮ! ", "Lernen.")).toBe(true);
    expect(answerMatchesExpected("Bücher werden weiterhin", "Bücher werden weiter(hin)")).toBe(true);
    expect(answerMatchesExpected("STRASSE", "Straße")).toBe(true);
  });

  it("detects whether any accepted scheme requires multiple components", () => {
    expect(expectedHasMultipleAnswers("Lieder; Theaterstücke <or> Stücke")).toBe(true);
    expect(expectedHasMultipleAnswers("Lernen <or> Wissen")).toBe(false);
  });
});
