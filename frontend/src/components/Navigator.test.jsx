import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Navigator from "./Navigator.jsx";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../api/auth", () => ({ useAuth: authMocks.useAuth }));
vi.mock("../hooks/useMaxWidth.js", () => ({ default: () => false }));

describe("mock exam navigation release gate", () => {
  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({
      user: {
        telephone: "13800138000",
        release_access: false,
        entitlements: [{
          status: "active",
          module: { key: "exam_preparation" },
          starts_at: "2026-01-01T00:00:00Z",
          expires_at: "2027-01-01T00:00:00Z",
        }],
      },
      loading: false,
      logout: vi.fn(),
    });
  });

  it("shows mock exam history to an entitled user regardless of release access", () => {
    render(<MemoryRouter initialEntries={["/modules/exam-preparation"]}><Navigator /></MemoryRouter>);

    expect(screen.getByRole("button", { name: "模拟考试记录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "延长备考季" })).toBeInTheDocument();
  });
});
