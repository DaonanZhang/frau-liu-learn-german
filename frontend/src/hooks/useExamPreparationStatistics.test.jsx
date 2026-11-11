import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchExamPreparationStatistics } from "../api/exam_preparation/statistics.js";
import { useExamPreparationStatistics } from "./useExamPreparationStatistics.js";

vi.mock("../api/exam_preparation/statistics.js", () => ({
  fetchExamPreparationStatistics: vi.fn(),
}));

describe("useExamPreparationStatistics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns levels after fetching statistics once", async () => {
    const levels = { B1: 3, B2: 4, C1: 5 };
    fetchExamPreparationStatistics.mockResolvedValue({ levels });

    const { result } = renderHook(() => useExamPreparationStatistics());

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(levels));
    expect(fetchExamPreparationStatistics).toHaveBeenCalledTimes(1);
  });

  it("keeps null when the request fails", async () => {
    fetchExamPreparationStatistics.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useExamPreparationStatistics());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
    expect(fetchExamPreparationStatistics).toHaveBeenCalledTimes(1);
  });
});
