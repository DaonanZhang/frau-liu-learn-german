import { describe, expect, it } from "vitest";

import { moveClozeMatchingOption } from "./moveClozeMatchingOption.js";

describe("moveClozeMatchingOption", () => {
  it("moves an option to the selected blank without allowing duplicates", () => {
    expect(moveClozeMatchingOption(
      { first: "A", second: "B", unrelated: "keep" },
      ["first", "second"],
      "second",
      "A",
    )).toEqual({ first: "", second: "A", unrelated: "keep" });
  });

  it("clears a blank when no option is supplied", () => {
    expect(moveClozeMatchingOption({ first: "A" }, ["first"], "first", ""))
      .toEqual({ first: "" });
  });
});
