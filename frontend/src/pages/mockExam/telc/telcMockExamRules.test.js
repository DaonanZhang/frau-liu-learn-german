import { describe, expect, it } from "vitest";

import { audioSequenceForLevel } from "./telcMockExamRules.js";

describe("TELC mock exam level rules", () => {
  it("keeps the existing B1 listening playback rules", () => {
    const sequence = audioSequenceForLevel("B1");
    expect(sequence.filter(({ kind }) => kind === "break").map(({ durationSeconds }) => durationSeconds))
      .toEqual([60, 60]);
    expect(sequence.find(({ partKey }) => partKey === "listening_teil2").playCount).toBe(2);
  });

  it("plays every B2 listening recording once with 30-second gaps", () => {
    const sequence = audioSequenceForLevel("B2");
    const audioSteps = sequence.filter(({ kind }) => kind === "audio");
    expect(audioSteps.map(({ playbackLabel }) => playbackLabel)).toEqual(["einmal", "einmal", "einmal"]);
    expect(audioSteps.map(({ playCount }) => playCount)).toEqual([1, 1, 1]);
    expect(sequence.filter(({ kind }) => kind === "break").map(({ durationSeconds }) => durationSeconds))
      .toEqual([30, 30]);
  });
});
