import { describe, expect, it } from "vitest";

import { createCoreApi } from "../../src/application/core-api.js";
import { ReviewService } from "../../src/application/review-service.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("family and academic review", () => {
  it.each(["APPROVE", "REVISION_REQUIRED", "EXCUSE", "WAIVE"])(
    "rejects a sibling target before %s and before replaying a family review",
    async (decision) => {
      const seed = await createSubmittedTaskScenario("FAMILY", "CONFIRM", 2);
      const sibling = seed.children[1]!;
      const api = createCoreApi(seed.harness);
      const command = {
        action: "FAMILY_REVIEW",
        requestId: `family-child-scope-${decision.replaceAll("_", "-")}`,
        payload: { childId: seed.firstChild.id, assignmentId: seed.assignment.id, decision },
      };
      const auth = { openId: "wx-scenario-guardian" };
      const mismatched = { ...command, payload: { ...command.payload, childId: sibling.id } };

      expect(await api.handle(mismatched, auth)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(await seed.harness.repository.query("reviewRecords")).toHaveLength(0);
      expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(0);
      expect(
        await seed.harness.repository.read("taskAssignments", seed.assignment.id),
      ).toMatchObject({ taskState: "SUBMITTED" });

      const approved = await api.handle(command, auth);
      expect(approved).toMatchObject({ ok: true });
      expect(await api.handle(command, auth)).toEqual(approved);
      expect(await api.handle(mismatched, auth)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(await seed.harness.repository.query("reviewRecords")).toHaveLength(1);
      expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(
        decision === "APPROVE" ? 1 : 0,
      );

      await seed.harness.repository.transaction(async (tx) => {
        for (const link of await tx.query("guardianLinks", { childId: seed.firstChild.id }))
          await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
      });
      expect(await api.handle(command, auth)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    },
  );

  it.each([undefined, "", null])(
    "requires an explicit family-review childId: %s",
    async (childId) => {
      const seed = await createSubmittedTaskScenario("FAMILY");
      const api = createCoreApi(seed.harness);
      expect(
        await api.handle(
          {
            action: "FAMILY_REVIEW",
            requestId: "family-review-missing-child",
            payload: { childId, assignmentId: seed.assignment.id, decision: "APPROVE" },
          },
          { openId: "wx-scenario-guardian" },
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "INVALID_INPUT" },
      });
      expect(await seed.harness.repository.query("reviewRecords")).toHaveLength(0);
    },
  );

  it("family approval completes a family task and grants configured sunlight", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    const reviews = new ReviewService(seed.harness, sunlight);

    const result = await reviews.familyReview(seed.guardian, {
      childId: seed.firstChild.id,
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
      childId: seed.firstChild.id,
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
        childId: seed.firstChild.id,
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
      childId: seed.firstChild.id,
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
