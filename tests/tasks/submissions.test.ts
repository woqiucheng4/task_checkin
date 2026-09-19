import { describe, expect, it } from "vitest";

import { SubmissionService } from "../../src/application/submission-service.js";
import { TaskService } from "../../src/application/task-service.js";
import type { ActorContext, SubmissionMode } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

async function submissionScenario(submissionMode: SubmissionMode = "CONFIRM") {
  const seed = await createIdentityScenario(1);
  seed.harness.clock.set("2026-09-05T09:00:00.000Z");
  const tasks = new TaskService(seed.harness);
  const submissions = new SubmissionService(seed.harness);
  const task = await tasks.publishFamilyTask(seed.guardian, {
    allowLateSubmission: true,
    category: "LIFE",
    childIds: [seed.firstChild.id],
    dueAt: "2026-09-05T13:00:00.000Z",
    estimatedMinutes: 10,
    familyId: seed.family.id,
    importance: "REQUIRED",
    occurrenceDate: "2026-09-05",
    requestId: `submission-publish-${submissionMode}`,
    requiresAcademicReview: false,
    schedule: { kind: "ONCE", date: "2026-09-05" },
    startsAt: "2026-09-05T08:00:00.000Z",
    submissionMode,
    title: "整理书桌",
  });
  const assignment = (
    await seed.harness.repository.query("taskAssignments", { taskId: task.id })
  )[0];
  if (assignment === undefined) {
    throw new Error("assignment fixture missing");
  }
  const childActor: ActorContext = {
    accountId: seed.guardian.accountId,
    childId: seed.firstChild.id,
    mode: "CHILD",
  };
  return { ...seed, assignment, childActor, submissions, task, tasks };
}

describe("submission lifecycle", () => {
  it("rejects a cloud file ID without an authorized media record before saving", async () => {
    const seed = await submissionScenario("PHOTO");
    await expect(
      seed.submissions.submit(seed.childActor, {
        assignmentId: seed.assignment.id,
        mediaAssetIds: ["cloud://rental-env/tenant-private.jpg"],
        requestId: "submission-invalid-photo",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await seed.harness.repository.query("submissions")).toHaveLength(0);
    expect(await seed.harness.repository.read("taskAssignments", seed.assignment.id)).toMatchObject(
      { taskState: "PENDING" },
    );
  });

  it("authorizes the caller before returning a repeated submission", async () => {
    const seed = await submissionScenario();
    const request = {
      assignmentId: seed.assignment.id,
      mediaAssetIds: [],
      requestId: "submission-private-repeat",
    };
    await seed.submissions.submit(seed.childActor, request);
    await expect(
      seed.submissions.submit(
        { accountId: "outsider", childId: seed.firstChild.id, mode: "CHILD" },
        request,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("links a verified in-scope photo to its submission atomically", async () => {
    const seed = await submissionScenario("PHOTO");
    const now = seed.harness.clock.now();
    await seed.harness.repository.transaction((tx) =>
      tx.insert("mediaAssets", {
        id: "media-owned-photo",
        assignmentId: seed.assignment.id,
        byteSize: 1024,
        createdAt: now,
        updatedAt: now,
        expiresAt: "2026-10-05T00:00:00.000Z",
        mimeType: "image/jpeg",
        ownerScope: { kind: "FAMILY", familyId: seed.family.id },
        purpose: "SUBMISSION_EVIDENCE",
        status: "ACTIVE",
        storageKey: "task-checkin/family/owned-photo",
        uploaderAccountId: seed.guardian.accountId,
        visibleRoles: ["GUARDIAN"],
      }),
    );
    const result = await seed.submissions.submit(seed.childActor, {
      assignmentId: seed.assignment.id,
      mediaAssetIds: ["media-owned-photo"],
      requestId: "submission-owned-photo",
    });
    expect(await seed.harness.repository.query("submissionEvidenceLinks")).toMatchObject([
      {
        submissionId: result.submission.id,
        assignmentId: seed.assignment.id,
        mediaAssetId: "media-owned-photo",
        childId: seed.firstChild.id,
      },
    ]);
  });

  it("rejects an otherwise in-scope image bound to another assignment", async () => {
    const seed = await submissionScenario("PHOTO");
    const now = seed.harness.clock.now();
    await seed.harness.repository.transaction((tx) =>
      tx.insert("mediaAssets", {
        id: "media-other-assignment-photo",
        assignmentId: "another-assignment",
        byteSize: 1024,
        createdAt: now,
        updatedAt: now,
        expiresAt: "2026-10-05T00:00:00.000Z",
        mimeType: "image/jpeg",
        ownerScope: { kind: "FAMILY", familyId: seed.family.id },
        purpose: "SUBMISSION_EVIDENCE",
        status: "ACTIVE",
        storageKey: "task-checkin/family/other-assignment-photo",
        uploaderAccountId: seed.guardian.accountId,
        visibleRoles: ["GUARDIAN"],
      }),
    );

    await expect(
      seed.submissions.submit(seed.childActor, {
        assignmentId: seed.assignment.id,
        mediaAssetIds: ["media-other-assignment-photo"],
        requestId: "submission-other-assignment-photo",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("protects reward eligibility immediately after a valid submission", async () => {
    const seed = await submissionScenario();

    const result = await seed.submissions.submit(seed.childActor, {
      assignmentId: seed.assignment.id,
      mediaAssetIds: [],
      requestId: "submission-create-1",
    });

    expect(result.assignment).toMatchObject({
      rewardState: "PROTECTED",
      taskState: "SUBMITTED",
    });
  });

  it("returns the same submission for a repeated request id", async () => {
    const seed = await submissionScenario();
    const request = {
      assignmentId: seed.assignment.id,
      mediaAssetIds: [] as string[],
      requestId: "submission-idempotent",
    };

    const first = await seed.submissions.submit(seed.childActor, request);
    const repeated = await seed.submissions.submit(seed.childActor, request);

    expect(repeated.submission.id).toBe(first.submission.id);
    expect(
      await seed.harness.repository.query("submissions", { assignmentId: seed.assignment.id }),
    ).toHaveLength(1);
  });

  it("rejects a text submission without text", async () => {
    const seed = await submissionScenario("TEXT");

    await expect(
      seed.submissions.submit(seed.childActor, {
        assignmentId: seed.assignment.id,
        mediaAssetIds: [],
        requestId: "submission-missing-text",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("submits a revision without revoking an already granted reward", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    const submissions = new SubmissionService(seed.harness);
    const task = await tasks.publishGroupTask(seed.teacher, {
      allowLateSubmission: true,
      category: "LANGUAGE",
      dueAt: "2026-09-05T13:00:00.000Z",
      estimatedMinutes: 10,
      groupId: seed.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requestId: "revision-group-publish",
      requiresAcademicReview: true,
      schedule: { kind: "ONCE", date: "2026-09-05" },
      startsAt: "2026-09-05T08:00:00.000Z",
      submissionMode: "TEXT",
      title: "订正生字",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    if (assignment === undefined) {
      throw new Error("institution assignment fixture missing");
    }
    const childActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: seed.firstChild.id,
      mode: "CHILD",
    };
    await submissions.submit(childActor, {
      assignmentId: assignment.id,
      mediaAssetIds: [],
      requestId: "revision-initial-submit",
      text: "第一次完成",
    });
    await seed.harness.repository.transaction((tx) =>
      tx.update("taskAssignments", assignment.id, {
        academicState: "REVISION_REQUIRED",
        rewardState: "GRANTED",
        taskState: "REVISION_REQUIRED",
        updatedAt: seed.harness.clock.now(),
      }),
    );

    const result = await submissions.supplement(childActor, {
      assignmentId: assignment.id,
      mediaAssetIds: [],
      requestId: "submission-revision-1",
      text: "已经重新完成",
    });

    expect(result.assignment).toMatchObject({
      academicState: "PENDING",
      rewardState: "GRANTED",
      taskState: "SUBMITTED",
    });
    expect(result.submission.revision).toBe(2);
  });

  it("expires an unsubmitted assignment with one visual event and no negative ledger", async () => {
    const seed = await submissionScenario();
    seed.harness.clock.set("2026-09-05T13:00:01.000Z");

    await seed.submissions.expireUnsubmitted(seed.platform, {
      requestId: "submission-expire-1",
    });
    await seed.submissions.expireUnsubmitted(seed.platform, {
      requestId: "submission-expire-2",
    });

    expect(await seed.harness.repository.read("taskAssignments", seed.assignment.id)).toMatchObject(
      {
        publicPoolEventCreated: true,
        taskState: "EXPIRED",
      },
    );
    expect(
      await seed.harness.repository.query("publicPoolEvents", {
        assignmentId: seed.assignment.id,
      }),
    ).toHaveLength(1);
    expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(0);
  });

  it("lets a guardian excuse a family task without granting sunlight", async () => {
    const seed = await submissionScenario();

    const result = await seed.submissions.markExcused(seed.guardian, {
      assignmentId: seed.assignment.id,
      requestId: "submission-excuse-1",
    });

    expect(result).toMatchObject({
      academicState: "EXCUSED",
      rewardState: "WAIVED",
      taskState: "EXCUSED",
    });
    expect(await seed.harness.repository.query("sunlightLedgers")).toHaveLength(0);
  });

  it("lets a child explicitly accept a late task as today's challenge", async () => {
    const seed = await submissionScenario();

    const result = await seed.submissions.acceptLateChallenge(seed.childActor, {
      assignmentId: seed.assignment.id,
      requestId: "submission-accept-late",
    });

    expect(result.acceptedLateChallenge).toBe(true);
  });
});
