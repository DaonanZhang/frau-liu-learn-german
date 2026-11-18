import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FillInExerciseModal from "./FillInExerciseModal.jsx";

describe("FillInExerciseModal dictionary regions", () => {
  it("marks the answer only after it is revealed", () => {
    render(
      <FillInExerciseModal
        isOpen
        onClose={() => {}}
        exerciseKey="subtitle-1"
        promptText="Ich ____ nach Hause."
        blanks={[{ answerText: "gehe" }]}
        hasPrev={false}
        hasNext={false}
      />,
    );

    expect(screen.queryByText("gehe")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "laufe" } });
    fireEvent.click(screen.getByRole("button", { name: "检查" }));
    expect(screen.queryByText("gehe")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "检查" }));

    expect(screen.getByText("gehe")).toHaveAttribute("data-dictionary-region");
  });
});

describe("FillInExerciseModal automatic flow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays on open and when the exercise changes", () => {
    vi.useFakeTimers();
    const onPlay = vi.fn();
    const props = {
      isOpen: true,
      onClose: () => {},
      exerciseKey: "subtitle-1",
      promptText: "Ich ____ nach Hause.",
      blanks: [{ answerText: "gehe" }],
      hasPrev: false,
      hasNext: false,
      onPlay,
    };
    const { rerender } = render(<FillInExerciseModal {...props} />);

    expect(onPlay).toHaveBeenCalledTimes(1);
    rerender(<FillInExerciseModal {...props} onPlay={() => onPlay()} />);
    expect(onPlay).toHaveBeenCalledTimes(1);
    rerender(<FillInExerciseModal {...props} exerciseKey="subtitle-2" />);
    expect(onPlay).toHaveBeenCalledTimes(2);
    rerender(<FillInExerciseModal {...props} exerciseKey="subtitle-2" isOpen={false} />);
    rerender(<FillInExerciseModal {...props} exerciseKey="subtitle-2" />);
    expect(onPlay).toHaveBeenCalledTimes(3);
  });

  it("silently checks only after a 1.5 second pause and advances after a correct answer", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(
      <FillInExerciseModal
        isOpen
        onClose={() => {}}
        exerciseKey="subtitle-1"
        promptText="Ich ____ nach Hause."
        blanks={[{ answerText: "gehe" }]}
        hasPrev={false}
        hasNext
        onNext={onNext}
      />,
    );
    const input = screen.getByRole("textbox");

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText("✅ 全对了！")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "gehe" } });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.change(input, { target: { value: "gehe " } });
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.queryByText("✅ 全对了！")).not.toBeInTheDocument();
    expect(input).toBeEnabled();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("✅ 全对了！")).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(999));
    expect(onNext).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("keeps incorrect answers editable without feedback and does not advance on the last exercise", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(
      <FillInExerciseModal
        isOpen
        onClose={() => {}}
        exerciseKey="subtitle-last"
        promptText="Ich ____ nach Hause."
        blanks={[{ answerText: "gehe" }]}
        hasPrev={false}
        hasNext={false}
        onNext={onNext}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "laufe" } });
    act(() => vi.advanceTimersByTime(1500));

    expect(screen.queryByText("Fast richtig")).not.toBeInTheDocument();
    expect(screen.queryByText("✅ 全对了！")).not.toBeInTheDocument();
    expect(input).toBeEnabled();

    fireEvent.change(input, { target: { value: "gehe" } });
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText("✅ 全对了！")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does not auto-advance after retrying an automatic correct result and checking manually", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(
      <FillInExerciseModal
        isOpen
        onClose={() => {}}
        exerciseKey="subtitle-1"
        promptText="Ich ____ nach Hause."
        blanks={[{ answerText: "gehe" }]}
        hasPrev={false}
        hasNext
        onNext={onNext}
      />,
    );
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "gehe" } });
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText("✅ 全对了！")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.change(input, { target: { value: "gehe" } });
    fireEvent.click(screen.getByRole("button", { name: "检查" }));
    expect(screen.getByText("✅ 全对了！")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("automatically checks a corrected answer after one manual wrong check", () => {
    vi.useFakeTimers();
    const onNext = vi.fn();
    render(
      <FillInExerciseModal
        isOpen
        onClose={() => {}}
        exerciseKey="subtitle-1"
        promptText="Ich ____ nach Hause."
        blanks={[{ answerText: "gehe" }]}
        hasPrev={false}
        hasNext
        onNext={onNext}
      />,
    );
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "laufe" } });
    fireEvent.click(screen.getByRole("button", { name: "检查" }));
    expect(screen.getByText("Fast richtig")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "gehe" } });
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.getByText("Fast richtig")).toBeInTheDocument();
    expect(screen.queryByText("✅ 全对了！")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("✅ 全对了！")).toBeInTheDocument();
    expect(screen.queryByText("Fast richtig")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
