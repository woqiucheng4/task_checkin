import { describe, expect, it } from "vitest";

import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("reward idempotency", () => {
  it("creates one positive ledger entry for a repeated approval command", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    const request = {
      assignmentId: seed.assignment.id,
      decision: "APPROVE" as const,
      requestId: "review-repeat-approval",
    };

    const first = await reviews.familyReview(seed.guardian, request);
    const repeated = await reviews.familyReview(seed.guardian, request);

    expect(repeated.review.id).toBe(first.review.id);
    expect(
      await seed.harness.repository.query("sunlightLedgers", {
        reason: "TASK_COMPLETED",
        referenceId: seed.assignment.id,
      }),
    ).toHaveLength(1);
  });

  it("returns the existing grant when a second request targets the same reward reference", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);

    const first = await sunlight.grantForAssignment(seed.platform, {
      amount: 2,
      assignmentId: seed.assignment.id,
      reason: "MANUAL_CORRECTION",
      requestId: "sunlight-first-request",
    });
    const repeated = await sunlight.grantForAssignment(seed.platform, {
      amount: 2,
      assignmentId: seed.assignment.id,
      reason: "MANUAL_CORRECTION",
      requestId: "sunlight-second-request",
    });

    expect(repeated.id).toBe(first.id);
    expect(await sunlight.ledgerForChild(seed.firstChild.id)).toHaveLength(1);
  });
});
