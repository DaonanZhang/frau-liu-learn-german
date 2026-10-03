import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ModuleAccessGate from "./ModuleAccessGate.jsx";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../api/auth/useAuth.js", () => ({ useAuth: authMocks.useAuth }));

function renderProtectedRoute(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>首页</div>} />
        <Route path="/modules/exam-preparation" element={<div>备考季首页</div>} />
        <Route
          path="*"
          element={(
            <ModuleAccessGate moduleId="exam-preparation">
              <div>受保护内容</div>
            </ModuleAccessGate>
          )}
        />
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

  it("redirects direct mock exam routes back to the exam preparation page", () => {
    renderProtectedRoute("/modules/exam-preparation/mock-exams");

    expect(screen.getByText("备考季首页")).toBeInTheDocument();
    expect(screen.queryByText("受保护内容")).not.toBeInTheDocument();
  });

  it("allows direct mock exam routes for users with a valid entitlement", () => {
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

    renderProtectedRoute("/modules/exam-preparation/mock-exams");

    expect(screen.getByText("受保护内容")).toBeInTheDocument();
  });
});
