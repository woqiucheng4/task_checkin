import { describe, expect, it } from "vitest";

import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("reward idempotency", () => {
  it("creates one positive ledger entry for a repeated approval command", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    const request = {
      assignmentId: seed.assignment.id,
      decision: "APPROVE" as const,
      requestId: "review-repeat-approval",
    };

    const first = await reviews.academicReview(seed.teacher, request);
    const repeated = await reviews.academicReview(seed.teacher, request);

    expect(repeated.review.id).toBe(first.review.id);
    expect(
      await seed.harness.repository.query("sunlightLedgers", {
        reason: "TASK_COMPLETED",
        referenceId: seed.assignment.id,
      }),
    ).toHaveLength(1);
  });

  it("returns the original group approval for a retried command with another request id", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    const first = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-group-first-approval",
    });
    const repeated = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-group-retry-approval",
    });

    expect(repeated.review.id).toBe(first.review.id);
    expect(await sunlight.ledgerForChild(seed.firstChild.id)).toHaveLength(1);
  });

  it("keeps separate group assignments and children in separate reward ledgers", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "CONFIRM", 2);
    const secondAssignment = seed.assignments[1];
    const secondChild = seed.children[1];
    if (secondAssignment === undefined || secondChild === undefined) {
      throw new Error("two-child scenario did not create both assignments");
    }
    await seed.submissions.submit(
      { accountId: seed.guardian.accountId, childId: secondChild.id, mode: "CHILD" },
      {
        assignmentId: secondAssignment.id,
        mediaAssetIds: [],
        requestId: "review-second-child-submit",
      },
    );
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-first-child-approval",
    });
    await reviews.academicReview(seed.teacher, {
      assignmentId: secondAssignment.id,
      decision: "APPROVE",
      requestId: "review-second-child-approval",
    });

    expect(await sunlight.ledgerForChild(seed.firstChild.id)).toMatchObject([
      { referenceId: seed.assignment.id },
    ]);
    expect(await sunlight.ledgerForChild(secondChild.id)).toMatchObject([
      { referenceId: secondAssignment.id },
    ]);
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
