import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client";
import { fetchExamPreparationContent, normalizeExamPreparationContent } from "./contentText.js";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));

describe("normalizeExamPreparationContent", () => {
  beforeEach(() => apiFetch.mockReset());

  it("turns stored br tags into line breaks throughout an exercise response", () => {
    const response = {
      instruction: "Erste Zeile<br>Zweite Zeile",
      content: {
        source_text: "Absatz 1<br/>Absatz 2<br />Absatz 3",
        dialogue: [{ text: "Hallo<br>Welt" }],
      },
      count: 1,
    };

    expect(normalizeExamPreparationContent(response)).toEqual({
      instruction: "Erste Zeile\nZweite Zeile",
      content: {
        source_text: "Absatz 1\nAbsatz 2\nAbsatz 3",
        dialogue: [{ text: "Hallo\nWelt" }],
      },
      count: 1,
    });
    expect(response.instruction).toContain("<br>");
  });

  it("leaves other html-like text escaped for React to render as text", () => {
    expect(normalizeExamPreparationContent("<strong>Titel</strong><br>Text")).toBe(
      "<strong>Titel</strong>\nText"
    );
  });

  it("normalizes TELC B2 cloze placeholders to the frontend blank key format", () => {
    expect(normalizeExamPreparationContent(
      "Vor {{blank 1}}, {{ blank2 }} und {{BLANK_12}}; {{blan3}} bleibt Text."
    )).toBe(
      "Vor {{blank_1}}, {{blank_2}} und {{blank_12}}; {{blan3}} bleibt Text."
    );
  });

  it("normalizes the response returned by the exam content fetcher", async () => {
    apiFetch.mockResolvedValue({ content: "Zeile 1<BR />Zeile 2" });

    await expect(fetchExamPreparationContent("/exercise/1/")).resolves.toEqual({
      content: "Zeile 1\nZeile 2",
    });
    expect(apiFetch).toHaveBeenCalledWith("/exercise/1/");
  });
});
