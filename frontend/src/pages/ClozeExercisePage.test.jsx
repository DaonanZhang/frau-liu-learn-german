import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appLayoutStyles = readFileSync(resolve("src/layouts/AppLayout.css"), "utf8");
const clozeStyles = readFileSync(resolve("src/pages/ClozeExercisePage.css"), "utf8");

describe("Cloze exercise layout", () => {
  it("keeps the option pool sticky in the viewport at every screen width", () => {
    const { container } = render(
      <>
        <style>{`${appLayoutStyles}\n${clozeStyles}`}</style>
        <div className="app-layout">
          <main className="cloze-page">
            <section className="cloze-pool-panel" />
          </main>
        </div>
      </>
    );

    const layout = container.querySelector(".app-layout");
    const pool = container.querySelector(".cloze-pool-panel");

    expect(getComputedStyle(layout).overflowX).toBe("clip");
    expect(getComputedStyle(pool).position).toBe("sticky");
    expect(getComputedStyle(pool).top).toBe("0px");
    expect(getComputedStyle(pool).zIndex).toBe("20");
  });
});
