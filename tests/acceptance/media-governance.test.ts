import { describe, expect, it } from "vitest";
import type { CreatedInvitation } from "../../src/application/invitation-service.js";
import type { UploadIntentResult } from "../../src/application/media-service.js";
import type {
  ChildGroupMembership,
  JoinRequest,
  MediaAsset,
  Submission,
  Task,
  TaskAssignment,
  TaskDraft,
} from "../../src/domain/model.js";
import { AcceptanceScenario, ORDINARY_TASK } from "./scenario.js";

describe("media governance acceptance", () => {
  it("AC-MEDIA-001 keeps OCR output as a draft until an adult confirms and publishes it", async () => {
    const scenario = new AcceptanceScenario();
    const family = await scenario.createFamilyWithChild();
    const institution = await scenario.createInstitution();
    const invitation = await scenario.call<CreatedInvitation>(
      institution.teacherOpenId,
      "CREATE_GROUP_INVITATION",
      {
        expiresAt: "2026-09-06T10:00:00.000Z",
        groupId: institution.group.id,
        maxClaims: 1,
      },
    );
    const join = await scenario.call<JoinRequest>(family.openId, "CLAIM_INVITATION", {
      childId: family.child.id,
      code: invitation.code,
      disclosure: { avatar: false, displayName: true, grade: true },
    });
    await scenario.call<ChildGroupMembership>(institution.teacherOpenId, "APPROVE_JOIN_REQUEST", {
      joinRequestId: join.id,
    });

    const upload = await scenario.call<UploadIntentResult>(
      institution.teacherOpenId,
      "CREATE_UPLOAD_INTENT",
      {
        byteSize: 512_000,
        mimeType: "image/jpeg",
        ownerScope: { kind: "ORGANIZATION", organizationId: institution.organization.id },
        purpose: "TASK_SOURCE",
        retentionDays: 90,
      },
    );
    await scenario.call(institution.teacherOpenId, "RECORD_UPLOAD", {
      assetId: upload.asset.id,
      observedByteSize: 512_000,
      observedMimeType: "image/jpeg",
    });
    const sourceFileId = `cloud://test/${upload.asset.storageKey}`;
    scenario.storage.setPrivateFile(sourceFileId, new Uint8Array(512_000));
    await scenario.harness.repository.transaction((tx) =>
      tx.update("mediaAssets", upload.asset.id, { fileId: sourceFileId }),
    );
    const draft = await scenario.call<TaskDraft>(
      institution.teacherOpenId,
      "RECOGNIZE_TASK_DRAFT",
      { assetId: upload.asset.id },
    );
    expect(draft).toMatchObject({ status: "DRAFT", title: "识别出的数学练习" });
    await expect(
      scenario.harness.repository.query("tasks", { draftId: draft.id }),
    ).resolves.toHaveLength(0);

    expect(
      await scenario.result(institution.teacherOpenId, "PUBLISH_TASK_DRAFT", {
        allowLateSubmission: true,
        draftId: draft.id,
        estimatedMinutes: 20,
        groupId: institution.group.id,
        importance: "REQUIRED",
        occurrenceDate: "2026-09-05",
        requiresAcademicReview: true,
        schedule: { date: "2026-09-05", kind: "ONCE" },
      }),
    ).toMatchObject({ error: { code: "INVALID_INPUT" }, ok: false });

    await scenario.call(institution.teacherOpenId, "EDIT_TASK_DRAFT", {
      category: "MATHEMATICS",
      draftId: draft.id,
      dueAt: "2026-09-05T13:00:00.000Z",
      startsAt: "2026-09-05T09:00:00.000Z",
      submissionMode: "PHOTO",
      title: "数学练习册第 12 页",
    });
    const task = await scenario.call<Task>(institution.teacherOpenId, "PUBLISH_TASK_DRAFT", {
      allowLateSubmission: true,
      draftId: draft.id,
      estimatedMinutes: 20,
      groupId: institution.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requiresAcademicReview: true,
      schedule: { date: "2026-09-05", kind: "ONCE" },
    });
    expect(task).toMatchObject({ draftId: draft.id, status: "PUBLISHED" });
  });

  it("AC-MEDIA-002 restricts evidence access and removes expired storage content", async () => {
    const scenario = new AcceptanceScenario();
    const family = await scenario.createFamilyWithChild();
    const platformOpenId = "wx-media-platform";
    await scenario.bootstrap(platformOpenId);
    const childActor = { mode: "ACCOUNT" as const };
    const task = await scenario.call<Task>(family.openId, "PUBLISH_FAMILY_TASK", {
      ...ORDINARY_TASK,
      childIds: [family.child.id],
      familyId: family.family.id,
      submissionMode: "PHOTO",
    });
    const assignment = (
      await scenario.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0] as TaskAssignment;
    const upload = await scenario.call<UploadIntentResult>(
      family.openId,
      "CREATE_UPLOAD_INTENT",
      {
        childId: family.child.id,
        assignmentId: assignment.id,
        byteSize: 100_000,
        mimeType: "image/png",
        purpose: "SUBMISSION_EVIDENCE",
        retentionDays: 90,
      },
      { actor: childActor },
    );
    await scenario.call(
      family.openId,
      "RECORD_UPLOAD",
      {
        childId: family.child.id,
        assetId: upload.asset.id,
        observedByteSize: 100_000,
        observedMimeType: "image/png",
      },
      { actor: childActor },
    );
    const submitted = await scenario.call<{ submission: Submission }>(
      family.openId,
      "SUBMIT_TASK",
      { childId: family.child.id, assignmentId: assignment.id, mediaAssetIds: [upload.asset.id] },
      { actor: childActor },
    );
    await scenario.call(
      family.openId,
      "ATTACH_SUBMISSION_EVIDENCE",
      { childId: family.child.id, assetId: upload.asset.id, submissionId: submitted.submission.id },
      { actor: childActor },
    );
    const linkCount = (
      await scenario.harness.repository.query("submissionEvidenceLinks", {
        submissionId: submitted.submission.id,
      })
    ).length;
    for (const assetId of [null, {}, "   "]) {
      await expect(
        scenario.result(
          family.openId,
          "ATTACH_SUBMISSION_EVIDENCE",
          { assetId, submissionId: submitted.submission.id },
          { actor: childActor },
        ),
      ).resolves.toMatchObject({ error: { code: "INVALID_INPUT" }, ok: false });
    }
    expect(
      await scenario.harness.repository.query("submissionEvidenceLinks", {
        submissionId: submitted.submission.id,
      }),
    ).toHaveLength(linkCount);

    await expect(
      scenario.call<MediaAsset>(family.openId, "READ_MEDIA_ASSET", {
        childId: family.child.id,
        assetId: upload.asset.id,
      }),
    ).resolves.toMatchObject({ id: upload.asset.id, status: "ACTIVE" });
    await scenario.harness.repository.transaction((tx) =>
      tx.update("taskAssignments", assignment.id, {
        taskState: "COMPLETED",
        updatedAt: scenario.harness.clock.now(),
      }),
    );
    scenario.harness.clock.set("2026-12-05T10:00:00.000Z");
    await scenario.call(
      platformOpenId,
      "DELETE_EXPIRED_MEDIA",
      {},
      { actor: { mode: "PLATFORM" }, platform: true },
    );
    expect(scenario.storage.deletedKeys).toEqual([upload.asset.storageKey]);
    expect(
      await scenario.result(family.openId, "READ_MEDIA_ASSET", { assetId: upload.asset.id }),
    ).toMatchObject({ error: { code: "NOT_FOUND" }, ok: false });
  });
});
