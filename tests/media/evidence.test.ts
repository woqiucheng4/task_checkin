import { describe, expect, it } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { TaskService } from "../../src/application/task-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

describe("submission evidence", () => {
  it("binds evidence to its upload assignment and caps the public attach action atomically", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const submission = (
      await seed.harness.repository.query("submissions", { assignmentId: seed.assignment.id })
    )[0];
    if (!submission) throw new Error("submission fixture missing");
    const uploads = await Promise.all(
      ["one", "two", "three", "four"].map(async (suffix) => {
        const intent = await media.createUploadIntent(seed.childActor, {
          childId: seed.firstChild.id,
          assignmentId: seed.assignment.id,
          byteSize: 200_000,
          mimeType: "image/jpeg",
          purpose: "SUBMISSION_EVIDENCE",
          requestId: `evidence-attach-${suffix}-intent`,
          retentionDays: 90,
        });
        return media.recordUpload(seed.childActor, {
          childId: seed.firstChild.id,
          assetId: intent.asset.id,
          observedByteSize: 200_000,
          observedMimeType: "image/jpeg",
          requestId: `evidence-attach-${suffix}-record`,
        });
      }),
    );
    for (const [index, upload] of uploads.entries()) {
      const action = media.attachSubmissionEvidence(seed.childActor, {
        childId: seed.firstChild.id,
        assetId: upload.id,
        requestId: `evidence-attach-${index}`,
        submissionId: submission.id,
      });
      if (index < 3) await expect(action).resolves.toMatchObject({ mediaAssetId: upload.id });
      else await expect(action).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(
      await seed.harness.repository.query("submissionEvidenceLinks", {
        submissionId: submission.id,
      }),
    ).toHaveLength(3);
  });

  it("rejects evidence from a different assignment even within the same group", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const tasks = new TaskService(seed.harness);
    const otherTask = await tasks.publishGroupTask(seed.teacher, {
      allowLateSubmission: true,
      category: "LIFE",
      dueAt: "2026-09-05T13:00:00.000Z",
      estimatedMinutes: 10,
      groupId: seed.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requestId: "other-assignment-task",
      requiresAcademicReview: true,
      schedule: { kind: "ONCE", date: "2026-09-05" },
      startsAt: "2026-09-05T08:00:00.000Z",
      submissionMode: "PHOTO",
      title: "另一项任务",
    });
    const otherAssignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: otherTask.id })
    )[0];
    const submission = (
      await seed.harness.repository.query("submissions", { assignmentId: seed.assignment.id })
    )[0];
    if (!otherAssignment || !submission) throw new Error("assignment fixture missing");
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const upload = await media.createUploadIntent(seed.childActor, {
      childId: seed.firstChild.id,
      assignmentId: otherAssignment.id,
      byteSize: 200_000,
      mimeType: "image/jpeg",
      purpose: "SUBMISSION_EVIDENCE",
      requestId: "other-assignment-evidence-intent",
      retentionDays: 90,
    });
    await media.recordUpload(seed.childActor, {
      childId: seed.firstChild.id,
      assetId: upload.asset.id,
      observedByteSize: 200_000,
      observedMimeType: "image/jpeg",
      requestId: "other-assignment-evidence-record",
    });

    await expect(
      media.attachSubmissionEvidence(seed.childActor, {
        childId: seed.firstChild.id,
        assetId: upload.asset.id,
        requestId: "other-assignment-evidence-attach",
        submissionId: submission.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires ninety-day retention for submission evidence", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );

    await expect(
      media.createUploadIntent(seed.childActor, {
        childId: seed.firstChild.id,
        assignmentId: seed.assignment.id,
        byteSize: 200_000,
        mimeType: "image/jpeg",
        purpose: "SUBMISSION_EVIDENCE",
        requestId: "evidence-short-retention",
        retentionDays: 30,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects more than three evidence IDs before accepting a submission", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");

    await expect(
      seed.submissions.supplement(seed.childActor, {
        childId: seed.firstChild.id,
        assignmentId: seed.assignment.id,
        mediaAssetIds: ["one", "two", "three", "four"],
        requestId: "too-many-evidence-ids",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("is readable only by guardians and authorized assignment reviewers", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({
        confidence: 0,
        provider: "unused",
        providerVersion: "unused",
      }),
    );
    const upload = await media.createUploadIntent(seed.childActor, {
      childId: seed.firstChild.id,
      assignmentId: seed.assignment.id,
      byteSize: 200_000,
      mimeType: "image/jpeg",
      purpose: "SUBMISSION_EVIDENCE",
      requestId: "evidence-upload-intent",
      retentionDays: 90,
    });
    await media.recordUpload(seed.childActor, {
      childId: seed.firstChild.id,
      assetId: upload.asset.id,
      observedByteSize: 200_000,
      observedMimeType: "image/jpeg",
      requestId: "evidence-upload-recorded",
    });
    const submission = (
      await seed.harness.repository.query("submissions", { assignmentId: seed.assignment.id })
    )[0];
    if (submission === undefined) {
      throw new Error("submission fixture missing");
    }
    await media.attachSubmissionEvidence(seed.childActor, {
      childId: seed.firstChild.id,
      assetId: upload.asset.id,
      requestId: "evidence-attach-1",
      submissionId: submission.id,
    });

    expect(upload.asset.expiresAt).toBe("2026-12-04T09:00:00.000Z");

    await expect(
      media.readAsset(seed.guardian, upload.asset.id, seed.firstChild.id),
    ).resolves.toMatchObject({
      id: upload.asset.id,
    });
    await expect(
      media.readAsset(seed.guardian, upload.asset.id, "unlinked-child"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).resolves.toMatchObject({
      id: upload.asset.id,
    });
    const otherGroup = await seed.identity.createGroup(seed.teacher, {
      name: "另一个学习小组",
      organizationId: seed.organization.id,
      requestId: "evidence-other-group",
      type: "LEARNING_GROUP",
    });
    const otherReviewerAccount = await seed.identity.createAccount({
      openId: "wx-evidence-other-reviewer",
      requestId: "evidence-other-reviewer-account",
    });
    await seed.harness.repository.transaction((tx) =>
      tx.insert("groupRoleBindings", {
        accountId: otherReviewerAccount.id,
        createdAt: seed.harness.clock.now(),
        groupId: otherGroup.id,
        id: "evidence-other-group-reviewer",
        organizationId: seed.organization.id,
        role: "ASSISTANT",
        status: "ACTIVE",
        updatedAt: seed.harness.clock.now(),
      }),
    );
    await expect(
      media.readAsset({ accountId: otherReviewerAccount.id, mode: "ACCOUNT" }, upload.asset.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const outsiderAccount = await seed.identity.createAccount({
      openId: "wx-evidence-outsider",
      requestId: "evidence-outsider-account",
    });
    const outsider: ActorContext = { accountId: outsiderAccount.id, mode: "ACCOUNT" };
    await expect(media.readAsset(outsider, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const membership = seed.memberships[0];
    if (!membership) throw new Error("Membership missing");
    await seed.invitations.withdrawChild(seed.guardian, {
      childId: seed.firstChild.id,
      childGroupMembershipId: membership.id,
      requestId: "evidence-withdraw-child-0001",
    });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
