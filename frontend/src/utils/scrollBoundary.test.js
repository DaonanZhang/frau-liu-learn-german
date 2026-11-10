import { describe, expect, it, vi } from "vitest";

import { stopDownwardScrollChainAtBottom } from "./scrollBoundary.js";

function wheelEvent({ deltaY, scrollTop, clientHeight = 100, scrollHeight = 300 }) {
  return {
    currentTarget: { scrollTop, clientHeight, scrollHeight },
    deltaY,
    preventDefault: vi.fn(),
  };
}

describe("stopDownwardScrollChainAtBottom", () => {
  it("blocks only continued downward scrolling at the bottom", () => {
    const downAtBottom = wheelEvent({ deltaY: 40, scrollTop: 200 });
    const upAtTop = wheelEvent({ deltaY: -40, scrollTop: 0 });
    const downInMiddle = wheelEvent({ deltaY: 40, scrollTop: 80 });

    stopDownwardScrollChainAtBottom(downAtBottom);
    stopDownwardScrollChainAtBottom(upAtTop);
    stopDownwardScrollChainAtBottom(downInMiddle);

    expect(downAtBottom.preventDefault).toHaveBeenCalledOnce();
    expect(upAtTop.preventDefault).not.toHaveBeenCalled();
    expect(downInMiddle.preventDefault).not.toHaveBeenCalled();
  });

  it("does not trap the page when the panel has no overflow", () => {
    const event = wheelEvent({ deltaY: 40, scrollTop: 0, scrollHeight: 100 });
    stopDownwardScrollChainAtBottom(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
