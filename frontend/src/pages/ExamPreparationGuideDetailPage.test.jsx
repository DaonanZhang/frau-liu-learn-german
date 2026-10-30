import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchGuideDetail,
  setGuideLiked,
} from "../api/exam_preparation/guides.js";
import ExamPreparationGuideDetailPage from "./ExamPreparationGuideDetailPage.jsx";

vi.mock("../api/exam_preparation/guides.js", () => ({
  fetchGuideDetail: vi.fn(),
  guideMatchesLevel: vi.fn(() => true),
  setGuideLiked: vi.fn(),
}));

const guide = {
  id: 3,
  title: "Telc B1 Lesen Teil 3",
  summary: "用硬性条件快速匹配广告。",
  author: "Frau Liu",
  cover_url: "/resources/ExamPreparation/exam_preparation_guide/Telc_B1_Lesen_Teil_3.png",
  badges: ["TELC B1", "Lesen", "Teil 3"],
  body_markdown: [
    "## 核心方法",
    "",
    "请记住 **同义改写**，不要只找原词。",
    "",
    "| 项目 | 内容 |",
    "| --- | --- |",
    "| 题型 | 匹配 |",
  ].join("\n"),
  view_count: 28,
  like_count: 6,
  is_liked: false,
  published_at: "2026-10-29T08:30:00Z",
};

function renderPage(level = "b1", guideId = "3") {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/tips/${guideId}`]}>
      <Routes>
        <Route
          path="/modules/exam-preparation/:level/tips/:guideId"
          element={<ExamPreparationGuideDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPreparationGuideDetailPage", () => {
  beforeEach(() => {
    fetchGuideDetail.mockReset();
    setGuideLiked.mockReset();
    fetchGuideDetail.mockResolvedValue(guide);
  });

  it("retrieves the guide once and renders its cover, summary, Markdown body, and updated counters", async () => {
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("攻略加载中");
    expect(await screen.findByRole("heading", { name: guide.title, level: 1 })).toBeInTheDocument();
    expect(fetchGuideDetail).toHaveBeenCalledTimes(1);
    expect(fetchGuideDetail).toHaveBeenCalledWith("3");
    expect(screen.getByRole("img", { name: `${guide.title} 封面` })).toHaveAttribute("src", guide.cover_url);
    expect(screen.getByText(guide.summary)).toBeInTheDocument();
    expect(screen.getByText("Frau Liu")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "核心方法", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("同义改写").tagName).toBe("STRONG");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "项目" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "匹配" })).toBeInTheDocument();
    expect(screen.getByLabelText("观看 28 次")).toBeInTheDocument();
    expect(screen.getByLabelText("6 个赞")).toBeInTheDocument();
  });

  it("optimistically adds a like with feedback animation and removes it without animation", async () => {
    setGuideLiked
      .mockResolvedValueOnce({ ...guide, like_count: 7, is_liked: true })
      .mockResolvedValueOnce({ ...guide, like_count: 6, is_liked: false });
    renderPage();

    const likeButton = await screen.findByRole("button", { name: "点赞" });
    fireEvent.click(likeButton);

    await waitFor(() => expect(setGuideLiked).toHaveBeenCalledWith(3, true));
    expect(likeButton).toHaveAttribute("aria-pressed", "true");
    expect(likeButton).toHaveClass("is-celebrating");
    expect(screen.getByLabelText("7 个赞")).toBeInTheDocument();
    await waitFor(() => expect(likeButton).not.toBeDisabled());

    fireEvent.click(likeButton);

    await waitFor(() => expect(setGuideLiked).toHaveBeenLastCalledWith(3, false));
    expect(likeButton).toHaveAttribute("aria-pressed", "false");
    expect(likeButton).not.toHaveClass("is-celebrating");
    expect(screen.getByLabelText("6 个赞")).toBeInTheDocument();
  });

  it("rolls back an optimistic like when the request fails", async () => {
    setGuideLiked.mockRejectedValue(new Error("offline"));
    renderPage();

    const likeButton = await screen.findByRole("button", { name: "点赞" });
    fireEvent.click(likeButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("点赞失败");
    expect(likeButton).toHaveAttribute("aria-pressed", "false");
    expect(likeButton).not.toHaveClass("is-celebrating");
    expect(screen.getByLabelText("6 个赞")).toBeInTheDocument();
  });

  it("keeps like failure feedback in the visible footer flow on desktop", () => {
    const css = readFileSync(resolve("src/pages/ExamPreparationGuideDetailPage.css"), "utf8");
    const errorRule = css.match(/\.exam-guide-detail__like-error\s*\{[^}]+\}/)?.[0] || "";

    expect(errorRule).toContain("position: static");
    expect(errorRule).not.toContain("bottom: -");
  });
});
