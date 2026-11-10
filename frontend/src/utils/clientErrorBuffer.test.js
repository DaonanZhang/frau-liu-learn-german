import { describe, expect, it } from "vitest";

import { getCapturedClientErrors } from "./clientErrorBuffer.js";

describe("clientErrorBuffer expected authentication events", () => {
  it("excludes device-session recovery errors from the generic error buffer", () => {
    const inactiveError = Object.assign(new Error("inactive"), {
      status: 403,
      data: { code: "device_session_inactive" },
    });
    const closedActivityError = Object.assign(new Error("closed"), {
      status: 409,
      data: { code: "device_activity_closed" },
    });

    console.error(inactiveError);
    console.error(closedActivityError);

    expect(getCapturedClientErrors()).toEqual([]);
  });
});
