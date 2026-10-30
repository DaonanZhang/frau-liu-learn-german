import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchGuides } from "../api/exam_preparation/guides.js";
import ExamPreparationTipsPage from "./ExamPreparationTipsPage.jsx";

vi.mock("../api/exam_preparation/guides.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, fetchGuides: vi.fn() };
});

const b1Guide = {
  id: 3,
  title: "Telc B1 Lesen Teil 3",
  summary: "用硬性条件快速匹配广告。",
  author: "Frau Liu",
  cover_url: "/resources/ExamPreparation/exam_preparation_guide/Telc_B1_Lesen_Teil_3.png",
  badges: ["TELC B1", "Lesen", "Teil 3"],
  view_count: 27,
  like_count: 6,
  published_at: "2026-10-29T08:30:00Z",
};

function renderPage(level = "b1") {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/tips`]}>
      <Routes>
        <Route path="/modules/exam-preparation/:level/tips" element={<ExamPreparationTipsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPreparationTipsPage", () => {
  beforeEach(() => {
    fetchGuides.mockReset();
  });

  it("shows a loading state, then renders complete vertical cards only for the active level", async () => {
    let resolveGuides;
    fetchGuides.mockReturnValue(new Promise((resolve) => {
      resolveGuides = resolve;
    }));

    renderPage("b1");

    expect(screen.getByRole("status")).toHaveTextContent("攻略加载中");

    resolveGuides({
      results: [
        b1Guide,
        { ...b1Guide, id: 9, title: "Telc B2 Schreiben", badges: ["TELC B2", "Schreiben"] },
      ],
      count: 2,
    });

    const cardLink = await screen.findByRole("link", { name: /Telc B1 Lesen Teil 3/ });
    expect(cardLink).toHaveAttribute("href", "/modules/exam-preparation/b1/tips/3");
    expect(screen.queryByText("Telc B2 Schreiben")).not.toBeInTheDocument();

    const card = cardLink.closest("article");
    expect(card).not.toBeNull();
    expect(within(card).getByRole("img", { name: "Frau Liu 网站图标" })).toHaveAttribute("src", "/images/icon.jpeg");
    expect(within(card).getByText("Frau Liu")).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "Telc B1 Lesen Teil 3 封面" })).toHaveAttribute(
      "src",
      b1Guide.cover_url,
    );
    expect(within(card).getByText("TELC B1")).toBeInTheDocument();
    expect(within(card).getByText("Lesen")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Telc B1 Lesen Teil 3" })).toBeInTheDocument();
    expect(within(card).getByText("用硬性条件快速匹配广告。")).toBeInTheDocument();
    expect(within(card).getByLabelText("观看 27 次")).toBeInTheDocument();
    expect(within(card).getByLabelText("6 个赞")).toBeInTheDocument();
    expect(within(card).getByText("2026/10/29")).toHaveAttribute("datetime", b1Guide.published_at);
  });

  it("renders a neutral empty state when the active level has no guides", async () => {
    fetchGuides.mockResolvedValue({ results: [{ ...b1Guide, badges: ["TELC B2"] }], count: 1 });

    renderPage("c1");

    expect(await screen.findByText("还没有发布攻略")).toBeInTheDocument();
  });

  it("keeps a guide usable when optional presentation fields are absent", async () => {
    fetchGuides.mockResolvedValue({
      results: [{ id: 4, title: "Telc B1 Schreiben", author: "Frau Liu", view_count: 0, like_count: 0 }],
      count: 1,
    });

    renderPage("b1");

    const link = await screen.findByRole("link", { name: /Telc B1 Schreiben/ });
    const card = link.closest("article");
    expect(card).not.toBeNull();
    expect(within(card).queryByRole("img", { name: "Telc B1 Schreiben 封面" })).not.toBeInTheDocument();
    expect(within(card).getByLabelText("观看 0 次")).toBeInTheDocument();
    expect(within(card).getByLabelText("0 个赞")).toBeInTheDocument();
  });

  it("shows a retryable error state when loading fails", async () => {
    fetchGuides.mockRejectedValue(new Error("offline"));

    renderPage("b1");

    expect(await screen.findByRole("alert")).toHaveTextContent("攻略加载失败");
    await waitFor(() => expect(fetchGuides).toHaveBeenCalledTimes(1));
  });
});
