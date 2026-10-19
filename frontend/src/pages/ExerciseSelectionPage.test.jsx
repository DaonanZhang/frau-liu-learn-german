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
});
