import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ExerciseSelectionPage from "./ExerciseSelectionPage.jsx";

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: null }),
}));

describe("ExerciseSelectionPage", () => {
  it.each([
    ["试用", [false, false, true, true, true, false], ["1", "2", "6", "3", "4", "5"]],
    ["已解锁", [false, false, false, false, false, false], ["1", "2", "3", "4", "5", "6"]],
  ])("按预期排列%s题目", async (_state, lockedStates, expectedOrder) => {
    const results = lockedStates.map((isLocked, index) => ({
      id: index + 1,
      is_locked: isLocked,
      exercise_base: { external_id: String(index + 1) },
    }));

    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b2/lesen/understanding"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/lesen/understanding"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/b2/lesen"
                backLabel="Zurück"
                eyebrow="Lesen"
                title="Teil 2"
                description="Beschreibung"
                fetchExercises={vi.fn().mockResolvedValue({ results })}
                buildExerciseHref={(exercise) => `/exercise/${exercise.id}`}
                buildCardTitle={(exercise) => exercise.exercise_base.external_id}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    const cardTitles = await screen.findAllByRole("heading", { level: 2 });
    expect(cardTitles.map((heading) => heading.textContent)).toEqual(expectedOrder);
  });

  it("resolves a scoped description from the active exam level", async () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b2/sprechen/teil-1"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/sprechen/teil-1"
            element={(
              <ExerciseSelectionPage
                backTo={(scope) => `/modules/exam-preparation/${scope.levelPath}/sprechen`}
                backLabel="Zurück"
                eyebrow="Sprechen"
                title="Teil 1"
                description={(scope) => `Präsentation ${scope.level}`}
                fetchExercises={vi.fn().mockResolvedValue({ results: [] })}
                buildExerciseHref={() => "/exercise/1"}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Präsentation B2")).toBeInTheDocument();
  });

  it("resolves card copy from the active exam level", async () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b2/hoeren/short-text-once"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/hoeren/short-text-once"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/b2/hoeren"
                backLabel="Zurück"
                eyebrow="Hören"
                title="Teil 2"
                description="Beschreibung"
                fetchExercises={vi.fn().mockResolvedValue({
                  results: [{ id: 1, exercise_base: { title: "Interview" } }],
                })}
                buildExerciseHref={() => "/exercise/1"}
                cardDescription={(scope) => `${scope.level}: nur einmal hören`}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("B2: nur einmal hören")).toBeInTheDocument();
  });
});
