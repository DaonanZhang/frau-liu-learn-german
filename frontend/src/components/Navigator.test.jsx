import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

  it("keeps the active level when opening the mock exam records page", () => {
    function LocationProbe() {
      const location = useLocation();
      return <div data-testid="location">{location.pathname}</div>;
    }
    render(<MemoryRouter initialEntries={["/modules/exam-preparation/telc/b2/mock-exam"]}><Routes>
      <Route path="/modules/exam-preparation/:level/*" element={<><Navigator /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "模拟考试记录" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/modules/exam-preparation/telc/b2/mock-exams");
  });
});

describe("profile navigation", () => {
  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({
      user: { username: "测试用户", telephone: "13800138000" },
      loading: false,
      logout: vi.fn(),
    });
  });

  it("places a decorative user icon before the username inside the profile control", () => {
    render(<MemoryRouter><Navigator /></MemoryRouter>);

    const profileButton = screen.getByRole("button", { name: "测试用户" });
    const icon = profileButton.querySelector(".nav-userIcon");
    const label = profileButton.querySelector(".nav-usernameLabel");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(label).toHaveTextContent("测试用户");
    expect(icon.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("exam preparation scoped navigation", () => {
  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({
      user: { username: "测试用户", telephone: "13800138000" },
      loading: false,
      logout: vi.fn(),
    });
  });

  it.each(["b1", "telc/b2"])("keeps %s level when opening favorites", (levelPath) => {
    render(
      <MemoryRouter initialEntries={[`/modules/exam-preparation/${levelPath}`]}>
        <Routes>
          <Route path="*" element={<><Navigator /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "收藏题目" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/favorite-questions?exam_type=TELC&level=${levelPath.endsWith("b1") ? "B1" : "B2"}`,
    );
  });

  it("keeps the global favorites entry unscoped", () => {
    render(
      <MemoryRouter initialEntries={["/learning-records"]}>
        <Routes><Route path="*" element={<><Navigator /><LocationProbe /></>} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "收藏题目" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/favorite-questions");
    expect(screen.getByTestId("location")).not.toHaveTextContent("exam_type");
  });

  it("includes the active level in the checkout return path", () => {
    render(
      <MemoryRouter initialEntries={["/modules/exam-preparation/b2"]}>
        <Routes><Route path="*" element={<><Navigator /><LocationProbe /></>} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "解锁备考季" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/modules/exam-preparation/purchase?return_to=%2Fmodules%2Fexam-preparation%2Fb2",
    );
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}
