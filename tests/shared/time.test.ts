import { describe, expect, it } from "vitest";

import { isLateSameDayPublication, shanghaiDateAt } from "../../src/shared/time.js";

describe("Shanghai calendar", () => {
  it("maps 2026-09-05T16:30Z to the next Shanghai calendar day", () => {
    expect(shanghaiDateAt("2026-09-05T16:30:00.000Z")).toBe("2026-09-06");
  });

  it("treats a mandatory same-day task published at 18:00 as late", () => {
    expect(
      isLateSameDayPublication({
        dueDate: "2026-09-06",
        publishedAt: "2026-09-06T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("does not treat a task published before 18:00 as late", () => {
    expect(
      isLateSameDayPublication({
        dueDate: "2026-09-06",
        publishedAt: "2026-09-06T09:59:59.999Z",
      }),
    ).toBe(false);
  });
});
