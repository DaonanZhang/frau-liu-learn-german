import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ExamTextAnnotationProvider,
} from "./ExamTextAnnotations.jsx";
import ListeningTranscript from "./ListeningTranscript.jsx";

describe("ListeningTranscript", () => {
  it("registers transcript text when annotation props are enabled", () => {
    render(
      <ExamTextAnnotationProvider scope="exam-annotations:v1:mock:attempt-1">
        <ListeningTranscript
          script={"Erste Zeile.\nZweite Zeile."}
          annotationRegionPrefix="transcript"
          annotationsEnabled
        />
      </ExamTextAnnotationProvider>,
    );

    const body = screen.getByText(/Erste Zeile/);
    expect(body.tagName).toBe("DIV");
    expect(body).toHaveClass("listening-transcript__body");
    expect(body).toHaveAttribute("data-exam-annotation-region", "transcript:script");
    expect(body).toHaveTextContent("Zweite Zeile.");
  });

  it("keeps the original markup when annotation props are omitted", () => {
    render(<ListeningTranscript script={"Erste Zeile.\nZweite Zeile."} />);

    const body = screen.getByText(/Erste Zeile/);
    expect(body.tagName).toBe("DIV");
    expect(body).toHaveClass("listening-transcript__body");
    expect(body).not.toHaveAttribute("data-exam-annotation-region");
    expect(body.textContent).toBe("Erste Zeile.\nZweite Zeile.");
  });
});
