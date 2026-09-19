import { describe, expect, it, vi } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { SubmissionService } from "../../src/application/submission-service.js";
import { PresentationService } from "../../src/application/presentation-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const taskInput = {
  allowLateSubmission: true,
  category: "MATHEMATICS" as const,
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 20,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  requiresAcademicReview: true,
  schedule: { kind: "ONCE" as const, date: "2026-09-05" },
  startsAt: "2026-09-05T10:00:00.000Z",
  submissionMode: "CONFIRM" as const,
  title: "有图片的数学练习",
};

async function createSourceAsset(
  media: MediaService,
  actor: ActorContext,
  ownerScope:
    | { kind: "FAMILY"; familyId: string }
    | { kind: "ORGANIZATION"; organizationId: string },
  requestId: string,
) {
  const intent = await media.createUploadIntent(actor, {
    byteSize: 200_000,
    mimeType: "image/jpeg",
    ownerScope,
    purpose: "TASK_SOURCE",
    requestId: `${requestId}-intent`,
    retentionDays: 90,
  });
  return media.recordUpload(actor, {
    assetId: intent.asset.id,
    observedByteSize: 200_000,
    observedMimeType: "image/jpeg",
    requestId: `${requestId}-record`,
  });
}

describe("task source images", () => {
  it("revalidates source availability atomically when cleanup runs between validation and publication", async () => {
    const seed = await createIdentityScenario(1);
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const asset = await createSourceAsset(
      media,
      seed.teacher,
      { kind: "ORGANIZATION", organizationId: seed.organization.id },
      "racing-cleanup-source",
    );
    seed.harness.clock.set("2026-12-05T10:00:00.000Z");
    const transaction = seed.harness.repository.transaction.bind(seed.harness.repository);
    vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce(async (work) => {
      await media.deleteExpiredAssets(seed.platform, { requestId: "cleanup-before-task-commit" });
      return transaction(work);
    });
    await expect(
      new TaskService(seed.harness).publishGroupTask(seed.teacher, {
        ...taskInput,
        groupId: seed.group.id,
        sourceAssetIds: [asset.id],
        requestId: "racing-source-publication",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await seed.harness.repository.query("tasks")).toEqual([]);
    expect(await seed.harness.repository.query("taskAssignments")).toEqual([]);
  });

  it.each(["FAMILY", "GROUP"] as const)(
    "authorizes %s sources through their actual assignments, including shared-account child isolation",
    async (source) => {
      const seed = await createIdentityScenario(2, 1);
      const storage = Object.assign(new FakeMediaStorage(), {
        downloadUrl: vi.fn(async () => "https://private.invalid/short-lived-signed-read"),
      });
      const media = new MediaService(
        seed.harness,
        storage,
        new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
      );
      const publisher = source === "FAMILY" ? seed.guardian : seed.teacher;
      const asset = await createSourceAsset(
        media,
        publisher,
        source === "FAMILY"
          ? { kind: "FAMILY", familyId: seed.family.id }
          : { kind: "ORGANIZATION", organizationId: seed.organization.id },
        "authorized-source",
      );
      await seed.harness.repository.transaction((tx) =>
        tx.update("mediaAssets", asset.id, { fileId: `cloud://test/${asset.storageKey}` }),
      );
      const childA: ActorContext = { ...seed.guardian, mode: "ACCOUNT" };
      const childB: ActorContext = {
        ...seed.guardian,
        mode: "ACCOUNT",
      };
      await expect(media.readAsset(publisher, asset.id)).resolves.toHaveProperty("downloadUrl");
      await expect(media.readAsset(childA, asset.id, seed.firstChild.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      const tasks = new TaskService(seed.harness);
      const task =
        source === "FAMILY"
          ? await tasks.publishFamilyTask(publisher, {
              ...taskInput,
              familyId: seed.family.id,
              childIds: [seed.firstChild.id],
              sourceAssetIds: [asset.id],
              requestId: "publish-family-source",
            })
          : await tasks.publishGroupTask(publisher, {
              ...taskInput,
              groupId: seed.group.id,
              sourceAssetIds: [asset.id],
              requestId: "publish-group-source",
            });
      const assignment = (
        await seed.harness.repository.query("taskAssignments", { taskId: task.id })
      )[0]!;
      await expect(media.readAsset(childA, asset.id, seed.firstChild.id)).resolves.toHaveProperty(
        "downloadUrl",
      );
      await expect(
        media.readAsset(seed.guardian, asset.id, seed.firstChild.id),
      ).resolves.toHaveProperty("downloadUrl");
      const signedReads = storage.downloadUrl.mock.calls.length;
      await expect(media.readAsset(childB, asset.id, seed.children[1]!.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(storage.downloadUrl).toHaveBeenCalledTimes(signedReads);
      await expect(
        new SubmissionService(seed.harness).detail(childA, assignment.id, seed.firstChild.id),
      ).resolves.toMatchObject({ sourceAssetIds: [asset.id] });
      await expect(
        new SubmissionService(seed.harness).detail(childB, assignment.id, seed.children[1]!.id),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const center = await new PresentationService(seed.harness).parentTaskCenter(seed.guardian, {
        childId: seed.firstChild.id,
      });
      expect(center.items[0]).toMatchObject({ sourceAssetIds: [asset.id] });
    },
  );

  it("denies other-group teachers and revokes group access after withdrawal, including the original uploader", async () => {
    const seed = await createIdentityScenario(1);
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const asset = await createSourceAsset(
      media,
      seed.teacher,
      { kind: "ORGANIZATION", organizationId: seed.organization.id },
      "group-private-source",
    );
    await new TaskService(seed.harness).publishGroupTask(seed.teacher, {
      ...taskInput,
      groupId: seed.group.id,
      sourceAssetIds: [asset.id],
      requestId: "publish-group-private",
    });
    const otherGroup = await seed.identity.createGroup(seed.teacher, {
      name: "另一个分组",
      organizationId: seed.organization.id,
      type: "LEARNING_GROUP",
      requestId: "other-source-group",
    });
    const otherTeacher: ActorContext = { accountId: "other-group-teacher", mode: "ACCOUNT" };
    const member = (
      await seed.harness.repository.query("organizationMembers", {
        accountId: seed.teacher.accountId,
      })
    )[0]!;
    await seed.harness.repository.transaction(async (tx) => {
      await tx.insert("organizationMembers", {
        ...member,
        id: "other-staff",
        accountId: otherTeacher.accountId,
        organizationMemberId: "other-staff-member",
        organizationRole: "STAFF",
      });
      await tx.insert("groupRoleBindings", {
        id: "other-group-binding",
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        accountId: otherTeacher.accountId,
        groupId: otherGroup.id,
        organizationId: seed.organization.id,
        role: "TEACHER",
        status: "ACTIVE",
      });
    });
    await expect(media.readAsset(otherTeacher, asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await seed.harness.repository.transaction((tx) =>
      tx.update("groupRoleBindings", "other-group-binding", { groupId: seed.group.id }),
    );
    await expect(media.readAsset(otherTeacher, asset.id)).resolves.toMatchObject({ id: asset.id });
    await seed.harness.repository.transaction((tx) =>
      tx.update("organizationMembers", "other-staff", { status: "WITHDRAWN" }),
    );
    await expect(media.readAsset(otherTeacher, asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(media.readAsset(seed.teacher, asset.id)).resolves.toMatchObject({ id: asset.id });
    await seed.invitations.withdrawChild(seed.guardian, {
      childGroupMembershipId: seed.memberships[0]!.id,
      requestId: "withdraw-source-child",
    });
    await expect(media.readAsset(seed.teacher, asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      media.readAsset(seed.guardian, asset.id, seed.firstChild.id),
    ).resolves.toMatchObject({ id: asset.id });
    await expect(
      media.readAsset({ ...seed.guardian, mode: "ACCOUNT" }, asset.id, seed.firstChild.id),
    ).resolves.toMatchObject({ id: asset.id });
  });

  it("keeps task attachments to active images uploaded by the family publisher", async () => {
    const seed = await createIdentityScenario(1);
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const tasks = new TaskService(seed.harness);
    const ownAsset = await createSourceAsset(
      media,
      seed.guardian,
      { kind: "FAMILY", familyId: seed.family.id },
      "family-source-own",
    );
    const teacherAsset = await createSourceAsset(
      media,
      seed.teacher,
      { kind: "ORGANIZATION", organizationId: seed.organization.id },
      "teacher-source-other",
    );

    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...taskInput,
        childIds: [seed.firstChild.id],
        familyId: seed.family.id,
        requestId: "family-source-forbidden",
        sourceAssetIds: [teacherAsset.id],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...taskInput,
        childIds: [seed.firstChild.id],
        familyId: seed.family.id,
        requestId: "family-source-max-count",
        sourceAssetIds: [ownAsset.id, ownAsset.id, ownAsset.id, ownAsset.id],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("persists valid organization task source image IDs", async () => {
    const seed = await createIdentityScenario(1);
    const media = new MediaService(
      seed.harness,
      new FakeMediaStorage(),
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const asset = await createSourceAsset(
      media,
      seed.teacher,
      { kind: "ORGANIZATION", organizationId: seed.organization.id },
      "organization-source-own",
    );

    await expect(
      new TaskService(seed.harness).publishGroupTask(seed.teacher, {
        ...taskInput,
        groupId: seed.group.id,
        requestId: "group-source-publish",
        sourceAssetIds: [asset.id],
      }),
    ).resolves.toMatchObject({ sourceAssetIds: [asset.id] });
  });

  it("rejects duplicate and malformed source IDs without publishing", async () => {
    const seed = await createIdentityScenario(1);
    const tasks = new TaskService(seed.harness);
    const input = {
      ...taskInput,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "family-source-malformed",
    };

    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...input,
        sourceAssetIds: ["same", "same"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...input,
        requestId: "family-source-not-array",
        sourceAssetIds: "not-an-array" as unknown as readonly string[],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...input,
        requestId: "family-source-null",
        sourceAssetIds: null as unknown as readonly string[],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await seed.harness.repository.query("tasks")).toEqual([]);
  });
});
