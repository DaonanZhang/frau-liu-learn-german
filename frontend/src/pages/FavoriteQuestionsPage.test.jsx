import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFavoriteQuestions } from "../api/exam_preparation/favoriteQuestions.js";
import FavoriteQuestionsPage from "./FavoriteQuestionsPage.jsx";

vi.mock("../api/exam_preparation/favoriteQuestions.js", () => ({
  fetchFavoriteQuestions: vi.fn(),
  removeFavoriteQuestion: vi.fn(),
}));

const b2Questions = [
  { id: 1, exercise_base_id: 1, skill: "READING", level: "B2", exam_type: "TELC", title: "B2 Lesen", href: "/scoped/b2-reading" },
  { id: 2, exercise_base_id: 2, skill: "LISTENING", level: "B2", exam_type: "TELC", title: "B2 Hören", href: "/scoped/b2-listening" },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderPage(initialEntry = "/favorite-questions") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes><Route path="/favorite-questions" element={<><FavoriteQuestionsPage /><LocationProbe /></>} /></Routes>
    </MemoryRouter>,
  );
}

describe("FavoriteQuestionsPage", () => {
  beforeEach(() => {
    fetchFavoriteQuestions.mockReset();
    fetchFavoriteQuestions.mockResolvedValue({ results: b2Questions });
  });

  it("starts at Alle, reloads by selected level, and keeps skill filtering client-side", async () => {
    renderPage();
    await screen.findByRole("link", { name: /B2 Lesen/ });
    expect(fetchFavoriteQuestions).toHaveBeenCalledWith({ examType: "TELC", level: "" });
    expect(screen.queryByRole("group", { name: "按考试类型筛选收藏题目" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "B2" }));
    await waitFor(() => expect(fetchFavoriteQuestions).toHaveBeenLastCalledWith({ examType: "TELC", level: "B2" }));
    await screen.findByRole("link", { name: /B2 Hören/ });
    fireEvent.click(screen.getByRole("tab", { name: /阅读/ }));
    expect(screen.getByRole("link", { name: /B2 Lesen/ })).toHaveAttribute("href", "/scoped/b2-reading");
    expect(screen.queryByRole("link", { name: /B2 Hören/ })).not.toBeInTheDocument();
    expect(screen.getByText("TELC")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /口语/ }));
    expect(screen.getByText("当前筛选下没有收藏题目")).toBeInTheDocument();
  });

  it("distinguishes empty favorites from no matches in selected filters", async () => {
    fetchFavoriteQuestions.mockResolvedValue({ results: [] });
    renderPage();
    expect(await screen.findByText("还没有收藏题目")).toBeInTheDocument();

  });

  it("keeps the Alle baseline when a scoped level has no favorites", async () => {
    fetchFavoriteQuestions
      .mockResolvedValueOnce({ results: [b2Questions[0]] })
      .mockResolvedValueOnce({ results: [] });
    renderPage();
    await screen.findByRole("link", { name: /B2 Lesen/ });

    fireEvent.click(screen.getByRole("button", { name: "B2" }));

    expect(await screen.findByText("当前筛选下没有收藏题目")).toBeInTheDocument();
    expect(screen.queryByText("还没有收藏题目")).not.toBeInTheDocument();
  });

  it("shows a scoped empty state when B2 finishes before the initial Alle request", async () => {
    let resolveAlle;
    fetchFavoriteQuestions
      .mockReturnValueOnce(new Promise((resolve) => { resolveAlle = resolve; }))
      .mockResolvedValueOnce({ results: [] });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "B2" }));

    expect(await screen.findByText("当前筛选下没有收藏题目")).toBeInTheDocument();
    expect(screen.queryByText("还没有收藏题目")).not.toBeInTheDocument();
    resolveAlle({ results: [b2Questions[0]] });
  });

  it("uses the scoped query on first load and preserves it while filtering", async () => {
    renderPage("/favorite-questions?exam_type=TELC&level=B2");

    await screen.findByRole("link", { name: /B2 Lesen/ });
    expect(fetchFavoriteQuestions).toHaveBeenCalledWith({ examType: "TELC", level: "B2" });
    expect(screen.getByRole("button", { name: "B2" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "B1" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/favorite-questions?exam_type=TELC&level=B1"));
    expect(fetchFavoriteQuestions).toHaveBeenLastCalledWith({ examType: "TELC", level: "B1" });
  });

  it("preserves the scope when opening and leaving an exercise collection", async () => {
    fetchFavoriteQuestions.mockResolvedValue({ results: [
      { ...b2Questions[0], exercise_base_id: 12 },
      { ...b2Questions[1], exercise_base_id: 12 },
    ] });
    renderPage("/favorite-questions?exam_type=TELC&level=B2");

    const collection = await screen.findByRole("link", { name: /查看收藏题目/ });
    expect(collection).toHaveAttribute("href", "/favorite-questions?exercise=12&exam_type=TELC&level=B2");
    fireEvent.click(collection);
    expect(await screen.findByRole("button", { name: "← 返回全部收藏" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/favorite-questions?exercise=12&exam_type=TELC&level=B2");

    fireEvent.click(screen.getByRole("button", { name: "← 返回全部收藏" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/favorite-questions?exam_type=TELC&level=B2");
  });

  it("falls back to the unscoped default for invalid query values", async () => {
    renderPage("/favorite-questions?exam_type=GOETHE&level=B3");

    await screen.findByRole("link", { name: /B2 Lesen/ });
    expect(fetchFavoriteQuestions).toHaveBeenCalledWith({ examType: "TELC", level: "" });
    expect(screen.getByRole("button", { name: "Alle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("/favorite-questions");
  });
});
