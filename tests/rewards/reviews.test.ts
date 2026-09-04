import { describe, expect, it } from "vitest";

import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("family and academic review", () => {
  it("family approval completes a family task and grants configured sunlight", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    const result = await reviews.familyReview(seed.guardian, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-family-approve",
    });

    expect(result.assignment).toMatchObject({
      rewardState: "GRANTED",
      taskState: "COMPLETED",
    });
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(2);
  });

  it("family revision request keeps protected reward eligibility", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const reviews = new ReviewService(seed.harness, new SunlightService(seed.harness));

    const result = await reviews.familyReview(seed.guardian, {
      assignmentId: seed.assignment.id,
      decision: "REVISION_REQUIRED",
      note: "请补一张完成照片",
      requestId: "review-family-revision",
    });

    expect(result.assignment).toMatchObject({
      rewardState: "PROTECTED",
      taskState: "REVISION_REQUIRED",
    });
  });

  it("teacher approval leaves reward pending when family auto reward is disabled", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    const result = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-academic-approve",
    });

    expect(result.assignment).toMatchObject({
      academicState: "APPROVED",
      rewardState: "PENDING_CONFIRMATION",
      taskState: "COMPLETED",
    });
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(0);
  });

  it("teacher approval automatically grants the family reward when enabled", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    await seed.harness.repository.transaction((tx) =>
      tx.update("families", seed.family.id, {
        autoRewardInstitutionTasks: true,
        updatedAt: seed.harness.clock.now(),
      }),
    );
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    const result = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-academic-auto",
    });

    expect(result.assignment.rewardState).toBe("GRANTED");
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(2);
  });

  it("academic revision never claws back sunlight already granted by a guardian", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    await reviews.familyReview(seed.guardian, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-guardian-before-teacher",
    });

    const result = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "REVISION_REQUIRED",
      requestId: "review-teacher-revision",
    });

    expect(result.assignment).toMatchObject({
      academicState: "REVISION_REQUIRED",
      rewardState: "GRANTED",
      taskState: "REVISION_REQUIRED",
    });
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(2);
  });

  it("grants the configured revision bonus after a corrected task is approved", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
    await reviews.familyReview(seed.guardian, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-before-revision",
    });
    await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "REVISION_REQUIRED",
      requestId: "review-needs-revision",
    });
    await seed.submissions.supplement(seed.childActor, {
      assignmentId: seed.assignment.id,
      mediaAssetIds: [],
      requestId: "review-corrected-submit",
      text: "订正完成",
    });

    await reviews.completeRevision(seed.teacher, {
      assignmentId: seed.assignment.id,
      requestId: "review-corrected-approved",
    });

    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(3);
    expect(await sunlight.ledgerForChild(seed.firstChild.id)).toMatchObject([
      { amount: 2, reason: "TASK_COMPLETED" },
      { amount: 1, reason: "REVISION_COMPLETED" },
    ]);
  });
});
