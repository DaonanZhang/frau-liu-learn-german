import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import ExerciseSelectionPage from "./ExerciseSelectionPage.jsx";

vi.mock("../api/auth/useAuth.js", () => ({
  useAuth: () => ({ user: null }),
}));

describe("ExerciseSelectionPage", () => {
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
