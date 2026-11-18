import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Navigator from "./Navigator.jsx";
import AppLayout from "../layouts/AppLayout.jsx";

const authMocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("../api/auth", () => ({ useAuth: authMocks.useAuth }));
vi.mock("../hooks/useMaxWidth.js", () => ({ default: () => false }));
vi.mock("./ReferralNoticeModal.jsx", () => ({ default: () => null }));

describe("dictionary navigation switch", () => {
  function renderLayout(path) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<AppLayout />}><Route path="*" element={<LocationProbe />} /></Route></Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    authMocks.useAuth.mockReturnValue({ isAuthenticated: true, loading: false });
  });

  afterEach(() => localStorage.clear());

  it.each([
    "/videos/7",
    "/modules/exam-preparation/b1/lesen/understanding/18",
    "/modules/exam-preparation/b2/hoeren/short-text-once/9",
    "/modules/exam-preparation/c1/schreiben/12/",
    "/modules/exam-preparation/b1/sprechen/teil-3/4",
    "/modules/exam-preparation/b2/sprachbausteine/cloze-choice/25",
    "/modules/exam-preparation/telc/c1/mock-exam?saved=37",
  ])("shows the switch on %s", (path) => {
    renderLayout(path);
    expect(screen.getByRole("switch", { name: "词典" })).toHaveAttribute("aria-checked", "true");
  });

  it.each([
    "/",
    "/lexicon",
    "/modules/science-season",
    "/modules/vlog-season",
    "/modules/exam-preparation/b1",
    "/modules/exam-preparation/b2/lesen/understanding",
    "/modules/exam-preparation/c1/schreiben",
    "/modules/exam-preparation/b1/tips/12",
    "/modules/exam-preparation/telc/c1/mock-exams",
    "/modules/exam-preparation/purchase",
  ])("hides the switch on %s", (path) => {
    renderLayout(path);
    expect(screen.queryByRole("switch", { name: "词典" })).not.toBeInTheDocument();
  });

  it("remembers a change after remounting on a different module's detail page", () => {
    const firstPage = renderLayout("/videos/7");
    const toggle = screen.getByRole("switch", { name: "词典" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    firstPage.unmount();

    renderLayout("/modules/exam-preparation/b1/lesen/understanding/18");
    const restoredToggle = screen.getByRole("switch", { name: "词典" });
    expect(restoredToggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(restoredToggle);
    expect(restoredToggle).toHaveAttribute("aria-checked", "true");
  });
});

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
