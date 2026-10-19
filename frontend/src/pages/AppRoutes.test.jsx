import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { addExamPreparationLevelRoutes, examPreparationLevelHomeRoutes } from "../App.jsx";

const authMock = vi.hoisted(() => ({ useAuth: vi.fn(() => ({ user: null })) }));
vi.mock("../api/auth/useAuth.js", () => ({ useAuth: authMock.useAuth }));

function Location() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}{location.hash}</output>;
}

describe("exam preparation route migration", () => {
  it.each([["b1", "B1"], ["b2", "B2"]])("renders the %s home from its actual route config", (pathLevel, level) => {
    const routes = addExamPreparationLevelRoutes(examPreparationLevelHomeRoutes());
    const { container } = render(
      <MemoryRouter initialEntries={[`/modules/exam-preparation/${pathLevel}`]}>
        <Routes>{routes.map((route) => <Route key={route.path} path={route.path} element={route.element} />)}</Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector(`[data-exam-level="${level}"]`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `备考季 · ${level}` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /进入听力模块/ })).toHaveAttribute(
      "href",
      `/modules/exam-preparation/${pathLevel}/hoeren`,
    );
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
