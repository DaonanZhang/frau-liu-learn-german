import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useExamPreparationStatistics } from "../hooks/useExamPreparationStatistics.js";
import ExamPreparationSpeakingPage from "./ExamPreparationSpeakingPage.jsx";

vi.mock("../hooks/useExamPreparationStatistics.js", () => ({
  useExamPreparationStatistics: vi.fn(),
}));

const B1_DESCRIPTION = "互相认识（Einander kennenlernen）—— 约 3 分钟。双方围绕姓名、来源、居住情况、语言学习经历、工作或学习等基本信息进行介绍并互相提问。";
const B2_DESCRIPTION = "主题展示（Präsentation）——从给出的主题中选择一个，参考括号中的提示要点，向搭档作约两分钟的简短展示。展示结束后，回答搭档提出的问题。";
const B1_OVERVIEW = "随后完成互相认识、主题讨论和共同策划三个部分。";
const B2_OVERVIEW = "随后完成做Pre、主题讨论和共同策划三个部分。";

function renderPage(level) {
  return render(
    <MemoryRouter initialEntries={[`/modules/exam-preparation/${level}/sprechen`]}>
      <Routes>
        <Route
          path="/modules/exam-preparation/:level/sprechen"
          element={<ExamPreparationSpeakingPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPreparationSpeakingPage", () => {
  it("shows the two combined TELC C1 speaking entries", () => {
    useExamPreparationStatistics.mockReturnValue({ C1: { types: { SPEAKING_TEIL1: 100, SPEAKING_TEIL2: 12, SPEAKING_TEIL3: 13 } } });
    renderPage("c1");

    const list = screen.getByRole("region", { name: "口语题型列表" });
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(/Teil 1a \+ Teil 1b/);
    expect(links[0]).toHaveAttribute("href", "/modules/exam-preparation/c1/sprechen/teil-2");
    expect(links[1]).toHaveAccessibleName(/Teil 2/);
    expect(links[1]).toHaveAttribute("href", "/modules/exam-preparation/c1/sprechen/teil-3");
    expect(within(list).queryByRole("link", { name: /Teil 1A/ })).not.toBeInTheDocument();
    expect(within(list).getByLabelText("12 道题目")).toBeInTheDocument();
    expect(within(list).getByLabelText("13 道题目")).toBeInTheDocument();
  });

  it("describes TELC B2 Teil 1 as a presentation", () => {
    useExamPreparationStatistics.mockReturnValue({ B2: { types: { SPEAKING_TEIL1: 1, SPEAKING_TEIL2: 2, SPEAKING_TEIL3: 3 } } });
    renderPage("b2");

    expect(screen.getByText(B2_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(B1_DESCRIPTION)).not.toBeInTheDocument();
    expect(screen.getByText(B2_OVERVIEW)).toBeInTheDocument();
    expect(screen.queryByText(B1_OVERVIEW)).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 道题目")).toBeInTheDocument();
  });

  it("keeps the TELC B1 Teil 1 description", () => {
    useExamPreparationStatistics.mockReturnValue({ B1: { types: { SPEAKING_TEIL1: 4, SPEAKING_TEIL2: 5, SPEAKING_TEIL3: 6 } } });
    renderPage("b1");

    expect(screen.getByText(B1_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(B2_DESCRIPTION)).not.toBeInTheDocument();
    expect(screen.getByText(B1_OVERVIEW)).toBeInTheDocument();
    expect(screen.queryByText(B2_OVERVIEW)).not.toBeInTheDocument();
    expect(screen.getByLabelText("4 道题目")).toBeInTheDocument();
  });
});
