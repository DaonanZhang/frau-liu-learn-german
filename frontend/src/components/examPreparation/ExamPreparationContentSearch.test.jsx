import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchExamPreparationContentSearch } from "../../api/exam_preparation/contentSearch.js";
import ExamPreparationContentSearch from "./ExamPreparationContentSearch.jsx";

vi.mock("../../api/exam_preparation/contentSearch.js", () => ({
  fetchExamPreparationContentSearch: vi.fn(),
}));

function response(overrides = {}) {
  return {
    count: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    results: [],
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    exercise_base_id: 17,
    title: "Berliner Wohnung",
    skill: "reading",
    skill_label: "Lesen",
    teil: 2,
    exercise_type: "READING_UNDERSTANDING",
    href: "/modules/exam-preparation/lesen/understanding/41",
    match_count: 1,
    matches: [{ label: "阅读文章", excerpt: "Eine Wohnung in Berlin." }],
    ...overrides,
  };
}

function renderSearch() {
  return render(
    <MemoryRouter>
      <ExamPreparationContentSearch />
    </MemoryRouter>,
  );
}

describe("ExamPreparationContentSearch", () => {
  beforeEach(() => {
    fetchExamPreparationContentSearch.mockReset();
  });

  it("does not search a blank query and submits selected filters with Enter", async () => {
    fetchExamPreparationContentSearch.mockResolvedValue(response());
    renderSearch();

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(fetchExamPreparationContentSearch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("搜索内容"), { target: { value: "Berlin Wohnung" } });
    fireEvent.change(screen.getByLabelText("模块"), { target: { value: "reading" } });
    expect(within(screen.getByLabelText("Teil")).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["全部 Teil", "Teil 1", "Teil 2", "Teil 3"]);
    fireEvent.change(screen.getByLabelText("Teil"), { target: { value: "2" } });
    fireEvent.submit(screen.getByRole("search"));

    await waitFor(() => expect(fetchExamPreparationContentSearch).toHaveBeenCalledWith({
      query: "Berlin Wohnung",
      skill: "reading",
      teil: "2",
      page: 1,
    }));
  });

  it("hides the Teil selector for Schreiben", () => {
    renderSearch();

    fireEvent.change(screen.getByLabelText("模块"), { target: { value: "writing" } });

    expect(screen.queryByLabelText("Teil")).not.toBeInTheDocument();
  });

  it("targets only the module selector for the inset dropdown arrow", () => {
    renderSearch();

    const moduleSelect = screen.getByLabelText("模块");
    expect(moduleSelect.closest("label")).toHaveClass("exam-content-search__field--module");

    fireEvent.change(moduleSelect, { target: { value: "reading" } });
    expect(screen.getByLabelText("Teil").closest("label"))
      .not.toHaveClass("exam-content-search__field--module");
  });

  it("shows loading, safely highlighted results, existing links, and expandable matches", async () => {
    let resolveRequest;
    fetchExamPreparationContentSearch.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    renderSearch();

    fireEvent.change(screen.getByLabelText("搜索内容"), { target: { value: "C++ a.b <script>" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(screen.getByText("正在搜索…")).toBeInTheDocument();

    const matches = Array.from({ length: 7 }, (_, index) => ({
      label: `命中位置 ${index + 1}`,
      excerpt: index === 0 ? "C++ 与 a.b，以及 <script> 都只是题目文本。" : `其他内容 ${index + 1}`,
    }));
    resolveRequest(response({ results: [result({ match_count: 7, matches })] }));

    const card = await screen.findByRole("article");
    expect(within(card).getByText("Lesen · Teil 2")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "打开题目" })).toHaveAttribute(
      "href",
      "/modules/exam-preparation/lesen/understanding/41",
    );
    expect(within(card).getAllByText("C++")).not.toHaveLength(0);
    expect(within(card).getAllByText("a.b")).not.toHaveLength(0);
    expect(within(card).getAllByText("<script>")).not.toHaveLength(0);
    expect(within(card).queryByText("命中位置 6")).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "展开其余 2 条" }));
    expect(within(card).getByText("命中位置 6")).toBeInTheDocument();
    expect(within(card).getByText("命中位置 7")).toBeInTheDocument();
  });

  it("renders neutral empty and retry-oriented error states", async () => {
    fetchExamPreparationContentSearch.mockResolvedValueOnce(response());
    const { rerender } = renderSearch();

    fireEvent.change(screen.getByLabelText("搜索内容"), { target: { value: "不存在" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByText("没有找到相关题库内容。" )).toBeInTheDocument();

    fetchExamPreparationContentSearch.mockRejectedValueOnce(new Error("network"));
    rerender(<MemoryRouter><ExamPreparationContentSearch /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("搜索内容"), { target: { value: "错误测试" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(await screen.findByText("搜索失败，请稍后重试。" )).toBeInTheDocument();
  });

  it("paginates submitted criteria and resets to page one for a new search", async () => {
    fetchExamPreparationContentSearch
      .mockResolvedValueOnce(response({
        count: 21,
        total_pages: 2,
        results: [result()],
      }))
      .mockResolvedValueOnce(response({
        count: 21,
        page: 2,
        total_pages: 2,
        results: [result({ exercise_base_id: 18, title: "Seite zwei" })],
      }))
      .mockResolvedValueOnce(response());
    renderSearch();

    const input = screen.getByLabelText("搜索内容");
    fireEvent.change(input, { target: { value: "Berlin" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await screen.findByText("Berliner Wohnung");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => expect(fetchExamPreparationContentSearch).toHaveBeenNthCalledWith(2, {
      query: "Berlin",
      skill: "",
      teil: "",
      page: 2,
    }));
    await screen.findByText("Seite zwei");

    fireEvent.change(input, { target: { value: "Hamburg" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(fetchExamPreparationContentSearch).toHaveBeenNthCalledWith(3, {
      query: "Hamburg",
      skill: "",
      teil: "",
      page: 1,
    }));
  });
});
