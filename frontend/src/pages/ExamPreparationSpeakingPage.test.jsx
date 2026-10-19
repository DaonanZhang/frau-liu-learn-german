import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ExamPreparationSpeakingPage from "./ExamPreparationSpeakingPage.jsx";

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
  it("describes TELC B2 Teil 1 as a presentation", () => {
    renderPage("b2");

    expect(screen.getByText(B2_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(B1_DESCRIPTION)).not.toBeInTheDocument();
    expect(screen.getByText(B2_OVERVIEW)).toBeInTheDocument();
    expect(screen.queryByText(B1_OVERVIEW)).not.toBeInTheDocument();
  });

  it("keeps the TELC B1 Teil 1 description", () => {
    renderPage("b1");

    expect(screen.getByText(B1_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(B2_DESCRIPTION)).not.toBeInTheDocument();
    expect(screen.getByText(B1_OVERVIEW)).toBeInTheDocument();
    expect(screen.queryByText(B2_OVERVIEW)).not.toBeInTheDocument();
  });
});
