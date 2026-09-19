import { describe, expect, it, vi } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";

describe("media retention", () => {
  it("expires an abandoned upload intent after 90 days without deleting an unverified storage key", async () => {
    const seed = await createIdentityScenario(1);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 10,
      mimeType: "image/png",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "abandoned-source-intent",
      retentionDays: 90,
    });
    seed.harness.clock.set("2026-12-05T10:00:00.000Z");
    await expect(
      media.deleteExpiredAssets(seed.platform, { requestId: "cleanup-abandoned-intent" }),
    ).resolves.toEqual({ deletedCount: 1 });
    expect(storage.deletedKeys).toEqual([]);
    expect(await seed.harness.repository.read("mediaAssets", upload.asset.id)).toMatchObject({
      status: "DELETED",
    });
  });

  it.each([1, 30, 365])(
    "rejects a caller-selected task source retention of %i days",
    async (retentionDays) => {
      const seed = await createIdentityScenario(1);
      const media = new MediaService(
        seed.harness,
        new FakeMediaStorage(),
        new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
      );
      await expect(
        media.createUploadIntent(seed.teacher, {
          byteSize: 10,
          mimeType: "image/png",
          ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
          purpose: "TASK_SOURCE",
          requestId: "fixed-source-retention",
          retentionDays,
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(await seed.harness.repository.query("mediaAssets")).toEqual([]);
    },
  );

  it("keeps published sources while any assignment is pending, then retains them for 90 days after the last completion", async () => {
    const seed = await createIdentityScenario(2);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 10,
      mimeType: "image/png",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "long-task-source-intent",
      retentionDays: 90,
    });
    await media.recordUpload(seed.teacher, {
      assetId: upload.asset.id,
      observedByteSize: 10,
      observedMimeType: "image/png",
      requestId: "long-task-source-record",
    });
    const task = await new TaskService(seed.harness).publishGroupTask(seed.teacher, {
      title: "长期学习任务",
      category: "MATHEMATICS",
      startsAt: "2026-09-05T10:00:00.000Z",
      dueAt: "2027-09-05T10:00:00.000Z",
      occurrenceDate: "2026-09-05",
      schedule: { kind: "ONCE", date: "2026-09-05" },
      importance: "REQUIRED",
      submissionMode: "PHOTO",
      estimatedMinutes: 10,
      allowLateSubmission: true,
      requiresAcademicReview: true,
      groupId: seed.group.id,
      sourceAssetIds: [upload.asset.id],
      requestId: "long-task-source-publish",
    });
    seed.harness.clock.set("2026-12-05T10:00:00.000Z");
    await expect(
      media.deleteExpiredAssets(seed.platform, { requestId: "cleanup-still-pending" }),
    ).resolves.toEqual({ deletedCount: 0 });
    const assignments = await seed.harness.repository.query("taskAssignments", { taskId: task.id });
    await seed.harness.repository.transaction((tx) =>
      tx.update("taskAssignments", assignments[0]!.id, {
        taskState: "COMPLETED",
        updatedAt: seed.harness.clock.now(),
      }),
    );
    seed.harness.clock.set("2027-03-10T10:00:00.000Z");
    await expect(
      media.deleteExpiredAssets(seed.platform, { requestId: "cleanup-one-pending" }),
    ).resolves.toEqual({ deletedCount: 0 });
    await seed.harness.repository.transaction((tx) =>
      tx.update("taskAssignments", assignments[1]!.id, {
        taskState: "COMPLETED",
        updatedAt: seed.harness.clock.now(),
      }),
    );
    seed.harness.clock.set("2027-06-07T10:00:00.000Z");
    await expect(
      media.deleteExpiredAssets(seed.platform, {
        requestId: "cleanup-within-completion-retention",
      }),
    ).resolves.toEqual({ deletedCount: 0 });
    expect(storage.deletedKeys).toEqual([]);
    seed.harness.clock.set("2027-06-09T10:00:00.000Z");
    await expect(
      media.deleteExpiredAssets(seed.platform, { requestId: "cleanup-after-completion-retention" }),
    ).resolves.toEqual({ deletedCount: 1 });
    expect(storage.deletedKeys).toEqual([upload.asset.storageKey]);
    expect(
      await seed.harness.repository.query("auditLogs", { action: "MEDIA_EXPIRED_DELETED" }),
    ).toHaveLength(1);
  });

  it("deletes expired storage content and preserves only deleted metadata", async () => {
    const seed = await createIdentityScenario(1);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 100_000,
      mimeType: "image/png",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "retention-upload-intent",
      retentionDays: 90,
    });
    await media.recordUpload(seed.teacher, {
      assetId: upload.asset.id,
      observedByteSize: 100_000,
      observedMimeType: "image/png",
      requestId: "retention-upload-recorded",
    });
    seed.harness.clock.set("2026-12-05T10:00:00.000Z");

    const result = await media.deleteExpiredAssets(seed.platform, {
      requestId: "retention-delete-expired",
    });

    expect(result.deletedCount).toBe(1);
    expect(storage.deletedKeys).toEqual([upload.asset.storageKey]);
    expect(await seed.harness.repository.read("mediaAssets", upload.asset.id)).toMatchObject({
      status: "DELETED",
    });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("retries a failed storage deletion while preventing a task from publishing the claimed source", async () => {
    const seed = await createIdentityScenario(1);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({ confidence: 0, provider: "unused", providerVersion: "unused" }),
    );
    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 10,
      mimeType: "image/png",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "retry-source-intent",
      retentionDays: 90,
    });
    await media.recordUpload(seed.teacher, {
      assetId: upload.asset.id,
      observedByteSize: 10,
      observedMimeType: "image/png",
      requestId: "retry-source-record",
    });
    seed.harness.clock.set("2026-12-05T10:00:00.000Z");
    vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("temporary storage failure"));
    await expect(
      media.deleteExpiredAssets(seed.platform, { requestId: "retry-cleanup-first" }),
    ).rejects.toThrow("temporary storage failure");
    await expect(
      new TaskService(seed.harness).publishGroupTask(seed.teacher, {
        title: "不能重新引用清理中的题图",
        category: "MATHEMATICS",
        startsAt: "2026-09-05T10:00:00.000Z",
        dueAt: "2027-09-05T10:00:00.000Z",
        occurrenceDate: "2026-09-05",
        schedule: { kind: "ONCE", date: "2026-09-05" },
        importance: "REQUIRED",
        submissionMode: "PHOTO",
        estimatedMinutes: 10,
        allowLateSubmission: true,
        requiresAcademicReview: true,
        groupId: seed.group.id,
        sourceAssetIds: [upload.asset.id],
        requestId: "publish-cleanup-claimed",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      media.deleteExpiredAssets(seed.platform, { requestId: "retry-cleanup-second" }),
    ).resolves.toEqual({ deletedCount: 1 });
    expect(await seed.harness.repository.query("tasks")).toEqual([]);
    expect(await seed.harness.repository.read("mediaAssets", upload.asset.id)).toMatchObject({
      status: "DELETED",
    });
  });
});
