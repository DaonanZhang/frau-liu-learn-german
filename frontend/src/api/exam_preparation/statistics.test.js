import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../client.js";
import { fetchExamPreparationStatistics } from "./statistics.js";

vi.mock("../client.js", () => ({ apiFetch: vi.fn() }));

describe("exam preparation statistics API", () => {
  beforeEach(() => apiFetch.mockReset());

  it("fetches statistics from the statistics endpoint", async () => {
    const statistics = { levels: { B1: {}, B2: {}, C1: {} } };
    apiFetch.mockResolvedValue(statistics);

    await expect(fetchExamPreparationStatistics()).resolves.toBe(statistics);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/exam_preparation/statistics/");
  });
});
