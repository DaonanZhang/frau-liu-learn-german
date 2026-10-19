import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../client";
import { fetchListeningExerciseDetail, fetchListeningExercises } from "./listeningExercises.js";
import { fetchReadingTitleMatchingExerciseDetail, fetchReadingTitleMatchingExercises } from "./readingTitleMatching.js";
import { fetchReadingUnderstandingExerciseDetail, fetchReadingUnderstandingExercises } from "./readingUnderstanding.js";
import { fetchReadingAdMatchingExerciseDetail, fetchReadingAdMatchingExercises } from "./readingAdMatching.js";
import { fetchClozeChoiceExerciseDetail, fetchClozeChoiceExercises, fetchClozeMatchingExerciseDetail, fetchClozeMatchingExercises } from "./clozeExercises.js";
import { fetchWritingExerciseDetail, fetchWritingExercises } from "./writingExercises.js";
import { fetchSpeakingTeilExerciseDetail, fetchSpeakingTeilExercises } from "./speakingExercises.js";

vi.mock("../client", () => ({ apiFetch: vi.fn().mockResolvedValue({ results: [] }) }));

const b2 = { examType: "TELC", level: "B2", levelPath: "b2" };

describe("exercise list scope requests", () => {
  beforeEach(() => apiFetch.mockClear());

  it.each([
    [() => fetchListeningExercises("dialog_true_false_twice", b2), "/listening-exercises/?exam_type=TELC&level=B2&listening_type=dialog_true_false_twice"],
    [() => fetchReadingTitleMatchingExercises(b2), "/reading-title-matching-exercises/?exam_type=TELC&level=B2"],
    [() => fetchReadingUnderstandingExercises(b2), "/reading-understanding-exercises/?exam_type=TELC&level=B2"],
    [() => fetchReadingAdMatchingExercises(b2), "/reading-ad-matching-exercises/?exam_type=TELC&level=B2"],
    [() => fetchClozeChoiceExercises(b2), "/cloze-choice-exercises/?exam_type=TELC&level=B2"],
    [() => fetchClozeMatchingExercises(b2), "/cloze-matching-exercises/?exam_type=TELC&level=B2"],
    [() => fetchWritingExercises(b2), "/writing-exercises/?exam_type=TELC&level=B2"],
    [() => fetchSpeakingTeilExercises(2, b2), "/speaking-teil-exercises/?exam_type=TELC&level=B2&exercise_base__exercise_type=SPEAKING_TEIL2"],
  ])("sends full scope to %s", async (fetch, expectedPath) => {
    await fetch();
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining(expectedPath));
  });

  it("does not request a list for an invalid scope", async () => {
    await expect(fetchWritingExercises({ examType: "TELC", level: "B3" })).resolves.toEqual({ results: [], count: 0 });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    [() => fetchListeningExerciseDetail(11, b2), "/listening-exercises/11/?exam_type=TELC&level=B2"],
    [() => fetchReadingTitleMatchingExerciseDetail(12, b2), "/reading-title-matching-exercises/12/?exam_type=TELC&level=B2"],
    [() => fetchReadingUnderstandingExerciseDetail(13, b2), "/reading-understanding-exercises/13/?exam_type=TELC&level=B2"],
    [() => fetchReadingAdMatchingExerciseDetail(14, b2), "/reading-ad-matching-exercises/14/?exam_type=TELC&level=B2"],
    [() => fetchClozeChoiceExerciseDetail(15, b2), "/cloze-choice-exercises/15/?exam_type=TELC&level=B2"],
    [() => fetchClozeMatchingExerciseDetail(16, b2), "/cloze-matching-exercises/16/?exam_type=TELC&level=B2"],
    [() => fetchWritingExerciseDetail(17, b2), "/writing-exercises/17/?exam_type=TELC&level=B2"],
    [() => fetchSpeakingTeilExerciseDetail(18, b2), "/speaking-teil-exercises/18/?exam_type=TELC&level=B2"],
  ])("sends full scope to detail request %#", async (fetch, expectedPath) => {
    await fetch();
    expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining(expectedPath));
  });
});
