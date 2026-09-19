import { describe, expect, it } from "vitest";
import { ReviewService } from "../../src/application/review-service.js";
import { SubmissionService } from "../../src/application/submission-service.js";
import {
  SunlightService,
  sunlightScopeForAssignment,
} from "../../src/application/sunlight-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

const baseTask = {
  allowLateSubmission: true,
  category: "LIFE" as const,
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 10,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  schedule: { date: "2026-09-05", kind: "ONCE" as const },
  startsAt: "2026-09-05T08:00:00.000Z",
  submissionMode: "CONFIRM" as const,
  title: "整理书桌",
};

describe("submission, review, and sunlight boundaries", () => {
  it("covers submission authorization, state, evidence, lateness, and expiry branches", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    const submissions = new SubmissionService(seed.harness);
    const familyTask = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "workflow-family-task",
      requiresAcademicReview: false,
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: familyTask.id })
    )[0];
    if (assignment === undefined) throw new Error("assignment missing");
    const childActor = {
      accountId: seed.guardian.accountId,

      mode: "ACCOUNT" as const,
    };
    await expect(
      submissions.submit(seed.teacher, {
        childId: seed.firstChild.id,
        assignmentId: assignment.id,
        mediaAssetIds: [],
        requestId: "workflow-submit-adult",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      submissions.submit(childActor, {
        childId: seed.firstChild.id,
        assignmentId: "missing",
        mediaAssetIds: [],
        requestId: "workflow-submit-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await submissions.acceptLateChallenge(childActor, {
      childId: seed.firstChild.id,
      assignmentId: assignment.id,
      requestId: "workflow-accept-late",
    });
    await submissions.markExcused(seed.guardian, {
      childId: seed.firstChild.id,
      assignmentId: assignment.id,
      requestId: "workflow-excuse-valid",
    });
    await expect(
      submissions.markExcused(seed.guardian, {
        childId: seed.firstChild.id,
        assignmentId: assignment.id,
        requestId: "workflow-excuse-repeat",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const photoTask = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "workflow-photo-task",
      requiresAcademicReview: false,
      submissionMode: "PHOTO",
      title: "拍照任务",
    });
    const photoAssignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: photoTask.id })
    )[0];
    if (photoAssignment === undefined) throw new Error("photo assignment missing");
    await expect(
      submissions.submit(childActor, {
        childId: seed.firstChild.id,
        assignmentId: photoAssignment.id,
        mediaAssetIds: [],
        requestId: "workflow-photo-empty",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const textTask = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "workflow-text-task",
      requiresAcademicReview: false,
      submissionMode: "TEXT",
      title: "文字任务",
    });
    const textAssignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: textTask.id })
    )[0];
    if (textAssignment === undefined) throw new Error("text assignment missing");
    await expect(
      submissions.submit(childActor, {
        childId: seed.firstChild.id,
        assignmentId: textAssignment.id,
        mediaAssetIds: [],
        requestId: "workflow-text-empty",
        text: " ",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const combinedTask = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "workflow-combined-task",
      requiresAcademicReview: false,
      submissionMode: "TEXT_AND_PHOTO",
      title: "图文任务",
    });
    const combinedAssignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: combinedTask.id })
    )[0];
    if (combinedAssignment === undefined) throw new Error("combined assignment missing");
    await expect(
      submissions.submit(childActor, {
        childId: seed.firstChild.id,
        assignmentId: combinedAssignment.id,
        mediaAssetIds: ["photo"],
        requestId: "workflow-combined-no-text",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      submissions.submit(childActor, {
        childId: seed.firstChild.id,
        assignmentId: combinedAssignment.id,
        mediaAssetIds: [],
        requestId: "workflow-combined-no-photo",
        text: "完成",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const lateTask = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      allowLateSubmission: false,
      childIds: [seed.firstChild.id],
      dueAt: "2026-09-05T09:30:00.000Z",
      familyId: seed.family.id,
      requestId: "workflow-late-task",
      requiresAcademicReview: false,
      title: "过期任务",
    });
    const lateAssignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: lateTask.id })
    )[0];
    if (lateAssignment === undefined) throw new Error("late assignment missing");
    seed.harness.clock.set("2026-09-05T10:00:00.000Z");
    await expect(
      submissions.submit(childActor, {
        childId: seed.firstChild.id,
        assignmentId: lateAssignment.id,
        mediaAssetIds: [],
        requestId: "workflow-late-submit",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      submissions.expireUnsubmitted(seed.guardian, { requestId: "workflow-expire-forbidden" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      submissions.expireUnsubmitted(seed.platform, { requestId: "workflow-expire-valid" }),
    ).resolves.toMatchObject({ expiredCount: 1 });
  });

  it("covers every family and academic review decision boundary", async () => {
    const familyRevision = await createSubmittedTaskScenario("FAMILY");
    const familyReviews = new ReviewService(
      familyRevision.harness,
      new SunlightService(familyRevision.harness),
    );
    await expect(
      familyReviews.completeRevision(familyRevision.teacher, {
        assignmentId: familyRevision.assignment.id,
        requestId: "workflow-no-revision",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const revised = await familyReviews.familyReview(familyRevision.guardian, {
      childId: familyRevision.firstChild.id,
      assignmentId: familyRevision.assignment.id,
      decision: "REVISION_REQUIRED",
      note: "请修改",
      requestId: "workflow-family-revision",
    });
    expect(revised.assignment.taskState).toBe("REVISION_REQUIRED");

    const familyExcuse = await createSubmittedTaskScenario("FAMILY");
    const excuseReviews = new ReviewService(
      familyExcuse.harness,
      new SunlightService(familyExcuse.harness),
    );
    expect(
      (
        await excuseReviews.familyReview(familyExcuse.guardian, {
          childId: familyExcuse.firstChild.id,
          assignmentId: familyExcuse.assignment.id,
          decision: "EXCUSE",
          requestId: "workflow-family-excuse",
        })
      ).assignment,
    ).toMatchObject({ rewardState: "WAIVED", taskState: "EXCUSED" });

    const familyWaive = await createSubmittedTaskScenario("FAMILY");
    const waiveReviews = new ReviewService(
      familyWaive.harness,
      new SunlightService(familyWaive.harness),
    );
    expect(
      (
        await waiveReviews.familyReview(familyWaive.guardian, {
          childId: familyWaive.firstChild.id,
          assignmentId: familyWaive.assignment.id,
          decision: "WAIVE",
          requestId: "workflow-family-waive",
        })
      ).assignment.rewardState,
    ).toBe("WAIVED");

    const organization = await createSubmittedTaskScenario("ORGANIZATION");
    const organizationReviews = new ReviewService(
      organization.harness,
      new SunlightService(organization.harness),
    );
    await expect(
      organizationReviews.familyReview(organization.guardian, {
        childId: organization.firstChild.id,
        assignmentId: organization.assignment.id,
        decision: "REVISION_REQUIRED",
        requestId: "workflow-org-family-revision",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const excused = await organizationReviews.academicReview(organization.teacher, {
      assignmentId: organization.assignment.id,
      decision: "EXCUSE",
      requestId: "workflow-academic-excuse",
    });
    expect(excused.assignment).toMatchObject({
      academicState: "EXCUSED",
      rewardState: "WAIVED",
      taskState: "EXCUSED",
    });
    await expect(
      organizationReviews.academicReview(organization.teacher, {
        assignmentId: organization.assignment.id,
        decision: "APPROVE",
        requestId: "workflow-academic-after-excuse",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      organizationReviews.academicReview(organization.teacher, {
        assignmentId: "missing",
        decision: "APPROVE",
        requestId: "workflow-review-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("covers sunlight authorization, missing context, conflicting replay, and both scopes", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const sunlight = new SunlightService(seed.harness);
    await expect(
      sunlight.grantForAssignment(seed.guardian, {
        amount: 1,
        assignmentId: seed.assignment.id,
        reason: "MANUAL_CORRECTION",
        requestId: "workflow-sunlight-forbidden",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      sunlight.grantForAssignment(seed.platform, {
        amount: 1,
        assignmentId: "missing",
        reason: "MANUAL_CORRECTION",
        requestId: "workflow-sunlight-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const first = await sunlight.grantForAssignment(seed.platform, {
      amount: 1,
      assignmentId: seed.assignment.id,
      reason: "MANUAL_CORRECTION",
      referenceId: "manual-reference",
      requestId: "workflow-sunlight-valid",
    });
    await expect(
      seed.harness.repository.transaction((tx) =>
        sunlight.grantInTransaction(tx, seed.platform.accountId, seed.firstChild.id, {
          amount: 2,
          assignmentId: seed.assignment.id,
          reason: "MANUAL_CORRECTION",
          referenceId: first.referenceId,
          requestId: "workflow-sunlight-conflict",
        }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sunlightScopeForAssignment({ familyId: seed.family.id })).toEqual({
      familyId: seed.family.id,
      kind: "FAMILY",
    });
    expect(
      sunlightScopeForAssignment({
        familyId: seed.family.id,
        organizationId: seed.organization.id,
      }),
    ).toEqual({ kind: "ORGANIZATION", organizationId: seed.organization.id });
  });
});
