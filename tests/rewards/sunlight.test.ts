import { describe, expect, it } from "vitest";

import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("sunlight ledger", () => {
  it("rejects every non-positive sunlight amount", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);

    await expect(
      sunlight.grantForAssignment(seed.platform, {
        amount: -1,
        assignmentId: seed.assignment.id,
        reason: "MANUAL_CORRECTION",
        requestId: "sunlight-negative",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("calculates balance only from immutable positive ledger entries", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    await sunlight.grantForAssignment(seed.platform, {
      amount: 2,
      assignmentId: seed.assignment.id,
      reason: "MANUAL_CORRECTION",
      requestId: "sunlight-manual-positive",
    });

    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(2);
  });
});
