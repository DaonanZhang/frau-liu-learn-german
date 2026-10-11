import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styleSources = [
  {
    source: readFileSync(resolve("src/pages/ClozeExercisePage.css"), "utf8"),
    topbarSelector: ".cloze-topbar",
    metaSelector: ".cloze-topbar__meta",
  },
  {
    source: readFileSync(resolve("src/pages/ReadingTitleMatchingPage.css"), "utf8"),
    topbarSelector: ".reading-title-topbar",
    metaSelector: ".reading-title-topbar__meta",
  },
  {
    source: readFileSync(resolve("src/pages/ReadingUnderstandingPage.css"), "utf8"),
    topbarSelector: ".reading-understanding-topbar",
    metaSelector: ".reading-understanding-topbar__meta",
  },
  {
    source: readFileSync(resolve("src/pages/ReadingAdMatchingPage.css"), "utf8"),
    topbarSelector: ".reading-ad-topbar",
    metaSelector: ".reading-ad-topbar__meta",
  },
  {
    source: readFileSync(resolve("src/pages/ListeningExercisePage.css"), "utf8"),
    topbarSelector: ".listening-exercise-topbar",
    metaSelector: ".listening-exercise-topbar__meta",
  },
  {
    source: readFileSync(resolve("src/pages/ExamPreparationWritingDetailPage.css"), "utf8"),
    topbarSelector: ".writing-detail-topbar",
    metaSelector: ".writing-detail-topbar__meta",
  },
  {
    source: readFileSync(resolve("src/pages/SpeakingTeilExercisePage.css"), "utf8"),
  },
];

describe("exam preparation question back-button labels", () => {
  it("keeps the back label and adjacent exercise metadata on one line", () => {
    for (const { source, topbarSelector, metaSelector } of styleSources) {
      expect(source).toMatch(/\.\S+(?:__back|-back)[^{]*\{[^}]*white-space:\s*nowrap/);
      if (topbarSelector) {
        expect(source).toMatch(new RegExp(`@media \\(max-width: 990px\\)[\\s\\S]*${topbarSelector}\\s*\\{[^}]*flex-direction:\\s*row[^}]*flex-wrap:\\s*nowrap`));
      }
      if (metaSelector) {
        expect(source).toMatch(new RegExp(`${metaSelector}\\s*\\{[^}]*white-space:\\s*nowrap`));
      }
    }
  });
});
