import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ModuleAccessGate from "./ModuleAccessGate.jsx";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../api/auth/useAuth.js", () => ({ useAuth: authMocks.useAuth }));

function renderProtectedRoute(path) {
  const protectedElement = (
    <ModuleAccessGate moduleId="exam-preparation">
      <div>受保护内容</div>
    </ModuleAccessGate>
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>首页</div>} />
        <Route path="/modules/exam-preparation" element={<div>备考季首页</div>} />
        <Route path="/modules/exam-preparation/b1" element={<div>B1等级首页</div>} />
        <Route path="/modules/exam-preparation/b2" element={<div>B2等级首页</div>} />
        <Route path="/modules/exam-preparation/telc/b1/mock-exam" element={protectedElement} />
        <Route path="/modules/exam-preparation/telc/b1/mock-exams" element={protectedElement} />
        <Route path="/modules/exam-preparation/telc/b2/mock-exam" element={protectedElement} />
        <Route path="/modules/exam-preparation/telc/b2/mock-exams" element={protectedElement} />
        <Route path="/modules/exam-preparation/mock-exam-notes" element={protectedElement} />
        <Route path="*" element={protectedElement} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("mock exam release gate", () => {
  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({
      user: { entitlements: [] },
      loading: false,
      isAuthenticated: true,
    });
  });

  it("keeps existing exam preparation pages available", () => {
    renderProtectedRoute("/modules/exam-preparation/hoeren");

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });

  it.each([
    "/modules/exam-preparation/telc/b1/mock-exam",
    "/modules/exam-preparation/telc/b1/mock-exams",
    "/modules/exam-preparation/telc/b2/mock-exam",
    "/modules/exam-preparation/telc/b2/mock-exams",
  ])("returns unentitled scoped mock route %s to its level home", (path) => {
    renderProtectedRoute(path);

    expect(screen.getByText(`${path.includes("/b1/") ? "B1" : "B2"}等级首页`)).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
  });

  it.each([
    ["/modules/exam-preparation/TELC/B1/mock-exams", "B1等级首页"],
    ["/modules/exam-preparation/TELC/B2/mock-exam", "B2等级首页"],
  ])("gates uppercase scoped mock route %s and normalizes its redirect", (path, expectedHome) => {
    renderProtectedRoute(path);

    expect(screen.getByText(expectedHome)).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
  });

  it.each([
    "/modules/exam-preparation/telc/b1/mock-exam",
    "/modules/exam-preparation/telc/b1/mock-exams",
    "/modules/exam-preparation/telc/b2/mock-exam",
    "/modules/exam-preparation/telc/b2/mock-exams",
  ])("allows scoped mock route %s for users with a valid entitlement", (path) => {
    authMocks.useAuth.mockReturnValue({
      user: {
        release_access: false,
        entitlements: [{
          status: "active",
          module: { key: "exam_preparation" },
          starts_at: "2026-01-01T00:00:00Z",
          expires_at: "2027-01-01T00:00:00Z",
        }],
      },
      loading: false,
      isAuthenticated: true,
    });

    renderProtectedRoute(path);

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });

  it("allows an uppercase scoped mock route for users with a valid entitlement", () => {
    authMocks.useAuth.mockReturnValue({
      user: {
        release_access: false,
        entitlements: [{
          status: "active",
          module: { key: "exam_preparation" },
          starts_at: "2026-01-01T00:00:00Z",
          expires_at: "2027-01-01T00:00:00Z",
        }],
      },
      loading: false,
      isAuthenticated: true,
    });

    renderProtectedRoute("/modules/exam-preparation/TELC/B2/mock-exam");

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });

  it("keeps a similarly prefixed non-mock route available to trial users", () => {
    renderProtectedRoute("/modules/exam-preparation/mock-exam-notes");

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });
});
