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

  it("rejects family approval of a group task even for its guardian", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const reviews = new ReviewService(seed.harness, new SunlightService(seed.harness));

    await expect(
      reviews.familyReview(seed.guardian, {
        assignmentId: seed.assignment.id,
        decision: "APPROVE",
        requestId: "review-family-group-denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects teacher academic approval of a family task", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const reviews = new ReviewService(seed.harness, new SunlightService(seed.harness));

    await expect(
      reviews.academicReview(seed.teacher, {
        assignmentId: seed.assignment.id,
        decision: "APPROVE",
        requestId: "review-academic-family-denied",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("teacher approval grants the affected child's family default reward", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    const result = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "APPROVE",
      requestId: "review-academic-auto",
    });

    expect(seed.task.source).toBe("LEARNING_GROUP");
    expect(result.assignment.rewardState).toBe("GRANTED");
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(2);
    expect(
      await seed.harness.repository.query("sunlightLedgers", {
        referenceId: seed.assignment.id,
      }),
    ).toHaveLength(1);
  });

  it("teacher revision retains the group task's protected eligibility", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    const result = await reviews.academicReview(seed.teacher, {
      assignmentId: seed.assignment.id,
      decision: "REVISION_REQUIRED",
      requestId: "review-teacher-revision",
    });

    expect(result.assignment).toMatchObject({
      academicState: "REVISION_REQUIRED",
      rewardState: "PROTECTED",
      taskState: "REVISION_REQUIRED",
    });
    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(0);
  });

  it("grants exactly the group task reward after a corrected submission is approved", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION", "TEXT");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);
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

    expect(await sunlight.balanceForChild(seed.firstChild.id)).toBe(2);
    expect(await sunlight.ledgerForChild(seed.firstChild.id)).toMatchObject([
      { amount: 2, reason: "TASK_COMPLETED" },
    ]);
  });
});
