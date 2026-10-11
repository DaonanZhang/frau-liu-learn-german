import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ExerciseOptionSheet from "./ExerciseOptionSheet.jsx";
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

  it("keeps default string labels and selection behavior", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ExerciseOptionSheet
        open
        title="Choose"
        options={[{ value: "a", label: "First" }]}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    const option = screen.getByRole("button", { name: "First" });
    expect(option.querySelector(".exercise-option-sheet__option-label")).toHaveTextContent("First");
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalled();
  });

  it("supports an optional label renderer without changing the option button", () => {
    render(
      <ExerciseOptionSheet
        open
        title="Choose"
        options={[{ value: "a", label: "First" }]}
        renderOptionLabel={(option) => <span data-testid="custom-label">{option.label}</span>}
      />,
    );

    expect(screen.getByRole("button", { name: "First" })).toContainElement(
      screen.getByTestId("custom-label"),
    );
  });
});
