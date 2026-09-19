import { describe, expect, it } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { TaskService } from "../../src/application/task-service.js";
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
    retentionDays: 30,
  });
  return media.recordUpload(actor, {
    assetId: intent.asset.id,
    observedByteSize: 200_000,
    observedMimeType: "image/jpeg",
    requestId: `${requestId}-record`,
  });
}

describe("task source images", () => {
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
});
