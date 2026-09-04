import { describe, expect, it } from "vitest";

import { assignmentBusinessKey, isScheduledOn } from "../../src/domain/tasks.js";

describe("task schedule", () => {
  it.each([
    ["2026-09-07", true],
    ["2026-09-08", false],
    ["2026-09-09", true],
  ])("evaluates Monday and Wednesday weekly occurrences for %s", (date, expected) => {
    expect(
      isScheduledOn(
        {
          kind: "WEEKLY",
          startDate: "2026-09-01",
          weekdays: [1, 3],
        },
        date,
      ),
    ).toBe(expected);
  });

  it("does not schedule a daily occurrence beyond its end date", () => {
    expect(
      isScheduledOn(
        { kind: "DAILY", startDate: "2026-09-01", endDate: "2026-09-05" },
        "2026-09-06",
      ),
    ).toBe(false);
  });

  it("creates a stable per-task per-recipient per-date business key", () => {
    expect(assignmentBusinessKey("task-1", "child-1", "2026-09-05")).toBe(
      "task-1:child-1:2026-09-05",
    );
  });
});
