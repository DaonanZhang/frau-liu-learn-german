import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getExerciseOptionSheetWidth } from "./ExerciseOptionSheet.utils.js";

const sheetStyles = readFileSync(resolve("src/components/examPreparation/ExerciseOptionSheet.css"), "utf8");

describe("exercise option sheet layout", () => {
  it("keeps the option modal compact while preserving mobile margins", () => {
    expect(sheetStyles).toContain("width: min(18rem, calc(100vw - 2rem));");
    expect(sheetStyles).toContain("width: min(18rem, calc(100vw - 1.5rem));");
  });

  it("uses the default width for short options and expands all options for a long one", () => {
    expect(getExerciseOptionSheetWidth([
      { label: "Kurz" },
      { label: "Auch kurz" },
    ], { viewportWidth: 1200 })).toBe(288);

    expect(getExerciseOptionSheetWidth([
      { label: "Eine sehr lange Antwortoption, die breiter als das Standardfenster ist" },
    ], { viewportWidth: 1200 })).toBeGreaterThan(288);
  });
});
