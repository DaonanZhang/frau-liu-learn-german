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

  it("shows C1 ad-matching titles in database id order", async () => {
    const results = [
      { id: 8, exercise_base: { title: "Änderung", external_id: "8" } },
      { id: 1, exercise_base: { title: "Zukunft", external_id: "1" } },
      { id: 2, exercise_base: { title: "Ökologie", external_id: "2" } },
    ];

    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/c1/lesen/ad-matching"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/lesen/ad-matching"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/c1/lesen"
                backLabel="Zurück"
                eyebrow="Lesen"
                title="Teil 3"
                description="Beschreibung"
                fetchExercises={vi.fn().mockResolvedValue({ results })}
                buildExerciseHref={(exercise) => `/exercise/${exercise.id}`}
                buildCardTitle={(exercise, _index, scope) => scope?.level === "C1"
                  ? exercise.exercise_base.title
                  : `Übung ${exercise.exercise_base.external_id}`}
                sortById={(scope) => scope.level === "C1"}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    const cardTitles = await screen.findAllByRole("heading", { level: 2 });
    expect(cardTitles.map((heading) => heading.textContent)).toEqual([
      "Zukunft",
      "Ökologie",
      "Änderung",
    ]);
  });

  it("keeps B2 ad-matching titles as Übung external_id", async () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b2/lesen/ad-matching"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/lesen/ad-matching"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/b2/lesen"
                backLabel="Zurück"
                eyebrow="Lesen"
                title="Teil 3"
                description="Beschreibung"
                fetchExercises={vi.fn().mockResolvedValue({ results: [
                  { id: 8, exercise_base: { title: "Änderung", external_id: "23" } },
                ] })}
                buildExerciseHref={(exercise) => `/exercise/${exercise.id}`}
                buildCardTitle={(exercise, _index, scope) => scope?.level === "C1"
                  ? exercise.exercise_base.title
                  : `Übung ${exercise.exercise_base.external_id}`}
                sortById={(scope) => scope.level === "C1"}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { level: 2 })).toHaveTextContent("Übung 23");
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

  it("resolves the corrected C1 ad-matching heading while keeping the B2 part number", async () => {
    const view = (level) => render(
      <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/lesen/ad-matching`]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/lesen/ad-matching"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/lesen"
                backLabel="Zurück"
                eyebrow="Lesen"
                title={(scope) => scope.level === "C1" ? "Teil 2" : "Teil 3"}
                description={(scope) => scope.level === "C1" ? "A–E 段落匹配" : "B2 Anzeigen"}
                fetchExercises={vi.fn().mockResolvedValue({ results: [] })}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    const c1 = view("c1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Teil 2");
    expect(screen.getByText("A–E 段落匹配")).toBeInTheDocument();
    c1.unmount();

    view("b2");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Teil 3");
    expect(screen.getByText("B2 Anzeigen")).toBeInTheDocument();
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

  it("shows the API count below the hero description", async () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b1/lesen/understanding"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/lesen/understanding"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/b1/lesen"
                backLabel="Zurück"
                eyebrow="Lesen"
                title="Teil 2"
                description="Beschreibung"
                fetchExercises={vi.fn().mockResolvedValue({ count: 17, results: [{ id: 1 }] })}
                buildExerciseHref={() => "/exercise/1"}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("17 道题目")).toBeInTheDocument();
  });

  it.each([
    ["falls back to the result count", { results: [{ id: 1 }, { id: 2 }] }, "2 道题目"],
    ["shows zero for an empty list", { count: "invalid", results: [] }, "0 道题目"],
  ])("%s", async (_name, response, expectedCount) => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b1/lesen/understanding"]}>
        <Routes>
          <Route
            path="/modules/exam-preparation/:level/lesen/understanding"
            element={(
              <ExerciseSelectionPage
                backTo="/modules/exam-preparation/b1/lesen"
                backLabel="Zurück"
                eyebrow="Lesen"
                title="Teil 2"
                description="Beschreibung"
                fetchExercises={vi.fn().mockResolvedValue(response)}
                buildExerciseHref={() => "/exercise/1"}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(expectedCount)).toBeInTheDocument();
  });
});
