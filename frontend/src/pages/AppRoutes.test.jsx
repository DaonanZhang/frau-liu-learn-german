import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { addExamPreparationLevelRoutes, examPreparationLevelHomeRoutes } from "../App.jsx";
import ExamPreparationTipsPage from "./ExamPreparationTipsPage.jsx";

const authMock = vi.hoisted(() => ({ useAuth: vi.fn(() => ({ user: null })) }));
vi.mock("../api/auth/useAuth.js", () => ({ useAuth: authMock.useAuth }));

function Location() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}{location.hash}</output>;
}

describe("exam preparation route migration", () => {
  it("resolves every listening selection description from the active level", () => {
    const appSource = readFileSync(resolve("src/App.jsx"), "utf8");

    [0, 1, 2].forEach((index) => {
      expect(appSource).toContain(
        `description={(scope) => examPreparationTypeDescription(LISTENING_TYPES[${index}], scope.level)}`,
      );
    });
  });

  it.each([["b1", "B1"], ["b2", "B2"], ["c1", "C1"]])("renders the %s home from its actual route config", (pathLevel, level) => {
    const routes = addExamPreparationLevelRoutes(examPreparationLevelHomeRoutes());
    const { container } = render(
      <MemoryRouter initialEntries={[`/modules/exam-preparation/${pathLevel}`]}>
        <Routes>{routes.map((route) => <Route key={route.path} path={route.path} element={route.element} />)}</Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector(`[data-exam-level="${level}"]`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `备考季 · ${level}` })).toBeInTheDocument();
    if (level === "C1") {
      expect(screen.getByRole("link", { name: /Unsere Tipps/ })).toHaveAttribute("href", `/modules/exam-preparation/${pathLevel}/tips`);
    } else {
      expect(screen.getByRole("link", { name: /进入听力模块/ })).toHaveAttribute("href", `/modules/exam-preparation/${pathLevel}/hoeren`);
      expect(screen.getByRole("link", { name: /Unsere Tipps/ })).toHaveAttribute("href", `/modules/exam-preparation/${pathLevel}/tips`);
    }
  });

  it("keeps the module root as the level selector", () => {
    const routes = addExamPreparationLevelRoutes(examPreparationLevelHomeRoutes());
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation"]}>
        <Routes>{routes.map((route) => <Route key={route.path} path={route.path} element={route.element} />)}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "选择考试级别" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /B1/ })).toHaveAttribute("href", "/modules/exam-preparation/b1");
    expect(screen.getByRole("link", { name: /B2/ })).toHaveAttribute("href", "/modules/exam-preparation/b2");
    expect(screen.getByRole("link", { name: /C1/ })).toHaveAttribute("href", "/modules/exam-preparation/c1");
  });

  it("renders tips with the level context and matching back link", () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/c1/tips"]}>
        <Routes><Route path="/modules/exam-preparation/:level/tips" element={<ExamPreparationTipsPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Unsere Tipps" })).toBeInTheDocument();
    expect(screen.getByText("TELC C1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回 TELC C1/ })).toHaveAttribute("href", "/modules/exam-preparation/c1");
  });

  it("redirects direct C1 specialty routes back to the C1 home", async () => {
    const routes = addExamPreparationLevelRoutes([
      { path: "/modules/exam-preparation/hoeren", element: <p>specialty content</p> },
      { path: "/modules/exam-preparation", element: <p>selector</p> },
      { path: "/modules/exam-preparation/c1", element: <p>C1 home</p> },
    ]);
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/c1/hoeren"]}>
        <Routes>{routes.map((route) => <Route key={route.path} path={route.path} element={<>{route.element}<Location /></>} />)}</Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("C1 home")).toBeInTheDocument();
    expect(screen.queryByText("specialty content")).not.toBeInTheDocument();
  });

  it("redirects legacy detail routes to B1 and preserves the query", async () => {
    const routes = addExamPreparationLevelRoutes([
      { path: "/modules/exam-preparation/lesen/understanding/:exerciseId", element: <p>exercise</p> },
    ]);
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/lesen/understanding/42?review=1#answer"]}>
        <Routes>
          {routes.map((route) => <Route key={route.path} path={route.path} element={<>{route.element}<Location /></>} />)}
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("/modules/exam-preparation/b1/lesen/understanding/42?review=1#answer")).toBeInTheDocument();
  });

  it("leaves the level home, exam-family mock route, and purchase routes unambiguous", () => {
    const routes = addExamPreparationLevelRoutes([
      { path: "/modules/exam-preparation/b1", element: <p>home</p> },
      { path: "/modules/exam-preparation/:examType/:level/mock-exam", element: <p /> },
      { path: "/modules/exam-preparation/*", element: <p>fallback</p> },
      { path: "/modules/:moduleId/purchase", element: <p /> },
    ]);
    expect(routes.map((route) => route.path)).toEqual([
      "/modules/exam-preparation/b1",
      "/modules/exam-preparation/:examType/:level/mock-exam",
      "/modules/exam-preparation/*",
      "/modules/:moduleId/purchase",
    ]);
  });

  it("matches the exam preparation checkout before the invalid-level fallback", () => {
    const routes = addExamPreparationLevelRoutes([
      { path: "/modules/exam-preparation/b1", element: <p>home</p> },
      { path: "/modules/:moduleId/purchase", element: <p>checkout marker</p> },
      { path: "/modules/exam-preparation/*", element: <p>invalid level marker</p> },
    ]);
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/purchase"]}>
        <Routes>{routes.map((route) => <Route key={route.path} path={route.path} element={route.element} />)}</Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("checkout marker")).toBeInTheDocument();
    expect(screen.queryByText("invalid level marker")).not.toBeInTheDocument();
  });

  it("does not mount a scoped list for an invalid route level", async () => {
    const fetchList = vi.fn();
    function ListPage() {
      useEffect(() => { fetchList(); }, []);
      return <p>list page</p>;
    }
    const routes = addExamPreparationLevelRoutes([
      { path: "/modules/exam-preparation/hoeren", element: <ListPage /> },
      { path: "/modules/exam-preparation", element: <p>level selector</p> },
      { path: "/modules/exam-preparation/*", element: <p>invalid</p> },
    ]);
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/c9/hoeren"]}>
        <Routes>{routes.map((route) => <Route key={route.path} path={route.path} element={route.element} />)}</Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("level selector")).toBeInTheDocument();
    expect(fetchList).not.toHaveBeenCalled();
  });
});
