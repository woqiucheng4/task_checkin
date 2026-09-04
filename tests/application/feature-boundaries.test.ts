import { describe, expect, it } from "vitest";
import { MediaService } from "../../src/application/media-service.js";
import { OrchardService } from "../../src/application/orchard-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { WishService } from "../../src/application/wish-service.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createHarvestedFruitScenario } from "../helpers/orchard-scenario.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeMediaStorage, FakeOcrProvider } from "../helpers/media-fakes.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

const taskFields = {
  allowLateSubmission: true,
  category: "MATHEMATICS" as const,
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 20,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  requiresAcademicReview: false,
  schedule: { date: "2026-09-05", kind: "ONCE" as const },
  startsAt: "2026-09-05T10:00:00.000Z",
  submissionMode: "CONFIRM" as const,
  title: "数学练习",
};

describe("feature validation boundaries", () => {
  it("covers task field, scope, publication, cancellation, and focus errors", async () => {
    const seed = await createIdentityScenario(1);
    const tasks = new TaskService(seed.harness);
    await expect(
      tasks.createTemplate(seed.guardian, {
        ...taskFields,
        familyId: seed.family.id,
        organizationId: seed.organization.id,
        requestId: "task-template-two-scopes",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.createTemplate(seed.guardian, { ...taskFields, requestId: "task-template-no-scope" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.createTemplate(seed.guardian, {
        ...taskFields,
        familyId: seed.family.id,
        requestId: "task-title-empty",
        title: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.createTemplate(seed.guardian, {
        ...taskFields,
        estimatedMinutes: 0,
        familyId: seed.family.id,
        requestId: "task-minutes-low",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.createTemplate(seed.guardian, {
        ...taskFields,
        estimatedMinutes: 481,
        familyId: seed.family.id,
        requestId: "task-minutes-high",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.createTemplate(seed.guardian, {
        ...taskFields,
        familyId: seed.family.id,
        occurrenceDate: "2026-09-06",
        requestId: "task-date-mismatch",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.createTemplate(seed.guardian, {
        ...taskFields,
        dueAt: taskFields.startsAt,
        familyId: seed.family.id,
        requestId: "task-dates-invalid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.archiveTemplate(seed.guardian, {
        requestId: "task-archive-missing",
        templateId: "missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...taskFields,
        childIds: [],
        familyId: seed.family.id,
        requestId: "task-family-empty",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.publishFamilyTask(seed.guardian, {
        ...taskFields,
        childIds: ["other-child"],
        familyId: seed.family.id,
        requestId: "task-family-other-child",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      tasks.publishGroupTask(seed.guardian, {
        ...taskFields,
        groupId: seed.group.id,
        requestId: "task-group-forbidden",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      tasks.cancelTask(seed.guardian, { requestId: "task-cancel-missing", taskId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      tasks.setFamilyFocus(seed.guardian, {
        assignmentIds: [],
        childId: seed.firstChild.id,
        date: "2026-09-05",
        requestId: "task-focus-empty",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.setFamilyFocus(seed.guardian, {
        assignmentIds: ["1", "2", "3", "4"],
        childId: seed.firstChild.id,
        date: "2026-09-05",
        requestId: "task-focus-many",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      tasks.setFamilyFocus(seed.guardian, {
        assignmentIds: ["missing"],
        childId: seed.firstChild.id,
        date: "2026-09-05",
        requestId: "task-focus-missing",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("covers upload ownership, state, scope, and draft errors", async () => {
    const seed = await createIdentityScenario(1);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({
        confidence: 0.2,
        provider: "ocr",
        providerVersion: "1",
        category: "unknown",
        description: "描述",
        dueAt: "due",
        startsAt: "start",
      }),
    );
    await expect(
      media.createUploadIntent(seed.teacher, {
        byteSize: 10,
        mimeType: "image/png",
        purpose: "TASK_SOURCE",
        requestId: "media-owner-missing",
        retentionDays: 1,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      media.createUploadIntent(seed.teacher, {
        byteSize: 10,
        mimeType: "image/png",
        ownerScope: { kind: "PLATFORM" },
        purpose: "TASK_SOURCE",
        requestId: "media-owner-platform",
        retentionDays: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const upload = await media.createUploadIntent(seed.teacher, {
      byteSize: 10,
      mimeType: "image/png",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "media-upload-valid",
      retentionDays: 1,
    });
    await expect(
      media.recordUpload(seed.guardian, {
        assetId: upload.asset.id,
        observedByteSize: 10,
        observedMimeType: "image/png",
        requestId: "media-uploader-other",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      media.recordUpload(seed.teacher, {
        assetId: upload.asset.id,
        observedByteSize: 11,
        observedMimeType: "image/png",
        requestId: "media-size-mismatch",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await media.recordUpload(seed.teacher, {
      assetId: upload.asset.id,
      observedByteSize: 10,
      observedMimeType: "image/png",
      requestId: "media-record-valid",
    });
    await expect(
      media.recordUpload(seed.teacher, {
        assetId: upload.asset.id,
        observedByteSize: 10,
        observedMimeType: "image/png",
        requestId: "media-record-repeat",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      media.recognizeTaskDraft(seed.teacher, {
        assetId: "missing",
        requestId: "media-recognize-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const draft = await media.recognizeTaskDraft(seed.teacher, {
      assetId: upload.asset.id,
      requestId: "media-recognize-valid",
    });
    expect(draft).toMatchObject({
      description: "描述",
      dueAt: "due",
      startsAt: "start",
    });
    expect(draft).not.toHaveProperty("category");
    await expect(
      media.editDraft(seed.teacher, { draftId: "missing", requestId: "media-edit-missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(media.readAsset(seed.guardian, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      media.deleteExpiredAssets(seed.guardian, { requestId: "media-delete-forbidden" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("covers complete OCR fields, family draft publication, and evidence validation", async () => {
    const seed = await createIdentityScenario(1);
    const storage = new FakeMediaStorage();
    const media = new MediaService(
      seed.harness,
      storage,
      new FakeOcrProvider({
        category: "LIFE",
        confidence: 0.9,
        description: "整理并拍照",
        dueAt: "2026-09-05T13:00:00.000Z",
        provider: "ocr",
        providerVersion: "2",
        startsAt: "2026-09-05T10:00:00.000Z",
        title: "整理书桌",
      }),
    );
    await expect(
      media.createUploadIntent(seed.guardian, {
        byteSize: 10,
        mimeType: "image/png",
        purpose: "SUBMISSION_EVIDENCE",
        requestId: "media-evidence-assignment-missing",
        retentionDays: 1,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const wrongChild: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: "other-child",
      mode: "CHILD",
    };
    await expect(
      media.createUploadIntent(wrongChild, {
        assignmentId: "missing",
        byteSize: 10,
        mimeType: "image/png",
        purpose: "SUBMISSION_EVIDENCE",
        requestId: "media-evidence-assignment-wrong",
        retentionDays: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const upload = await media.createUploadIntent(seed.guardian, {
      byteSize: 20,
      mimeType: "image/jpeg",
      ownerScope: { familyId: seed.family.id, kind: "FAMILY" },
      purpose: "TASK_SOURCE",
      requestId: "media-family-source-intent",
      retentionDays: 10,
    });
    await media.recordUpload(seed.guardian, {
      assetId: upload.asset.id,
      observedByteSize: 20,
      observedMimeType: "image/jpeg",
      requestId: "media-family-source-record",
    });
    const draft = await media.recognizeTaskDraft(seed.guardian, {
      assetId: upload.asset.id,
      requestId: "media-family-recognize",
    });
    expect(draft).toMatchObject({ category: "LIFE", description: "整理并拍照" });
    await media.editDraft(seed.guardian, {
      draftId: draft.id,
      requestId: "media-family-edit",
      submissionMode: "CONFIRM",
    });
    const task = await media.publishDraft(seed.guardian, {
      allowLateSubmission: false,
      childIds: [seed.firstChild.id],
      draftId: draft.id,
      estimatedMinutes: 5,
      familyId: seed.family.id,
      importance: "FOCUS",
      occurrenceDate: "2026-09-05",
      requestId: "media-family-publish",
      requiresAcademicReview: false,
      schedule: { date: "2026-09-05", kind: "ONCE" },
    });
    expect(task.source).toBe("FAMILY");
    await expect(
      media.editDraft(seed.guardian, { draftId: draft.id, requestId: "media-edit-published" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      media.attachSubmissionEvidence(
        {
          accountId: seed.guardian.accountId,
          childId: seed.firstChild.id,
          mode: "CHILD",
        },
        {
          assetId: upload.asset.id,
          requestId: "media-attach-submission-missing",
          submissionId: "missing",
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(media.readAsset(seed.teacher, upload.asset.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("covers orchard selection, active-tree, naming, catalog, and harvest errors", async () => {
    const seed = await createSubmittedTaskScenario("FAMILY");
    const orchard = new OrchardService(seed.harness);
    await expect(
      orchard.startTree(seed.guardian, {
        catalogId: "starter-apple",
        requestId: "orchard-actor-invalid",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      orchard.startTree(seed.childActor, {
        catalogId: "starter-apple",
        requestId: "short",
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      orchard.startTree(seed.childActor, {
        catalogId: "missing",
        requestId: "orchard-catalog-missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const tree = await orchard.startTree(seed.childActor, {
      catalogId: "starter-apple",
      requestId: "orchard-start-valid",
    });
    await expect(
      orchard.startTree(seed.childActor, {
        catalogId: "starter-apple",
        requestId: "orchard-start-duplicate",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      orchard.renameTree(seed.childActor, {
        name: "",
        requestId: "orchard-name-empty",
        treeId: tree.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      orchard.renameTree(seed.childActor, {
        name: "x".repeat(21),
        requestId: "orchard-name-long",
        treeId: tree.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      orchard.renameTree(seed.childActor, {
        name: "名字",
        requestId: "orchard-tree-other",
        treeId: "missing",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      orchard.harvestTree(seed.childActor, { requestId: "orchard-harvest-early", treeId: tree.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("covers wish actor, title, quantity, ownership, reservation, and lifecycle errors", async () => {
    const seed = await createHarvestedFruitScenario();
    const wishes = new WishService(seed.harness);
    await expect(
      wishes.createWish(seed.childActor, {
        childId: seed.firstChild.id,
        requestId: "wish-child-manage",
        title: "愿望",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      wishes.createWish(seed.guardian, {
        childId: seed.firstChild.id,
        requestId: "wish-title-empty",
        title: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      wishes.createWish(seed.guardian, {
        childId: seed.firstChild.id,
        requestId: "short",
        title: "愿望",
      }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      wishes.updateWish(seed.guardian, {
        requestId: "wish-update-missing",
        title: "新愿望",
        wishId: "missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const wish = await wishes.createWish(seed.guardian, {
      childId: seed.firstChild.id,
      requestId: "wish-create-boundary",
      title: "买一本书",
    });
    await expect(
      wishes.linkFruit(seed.guardian, {
        fruitCollectionId: seed.harvest.fruit.id,
        quantity: 0,
        requestId: "wish-link-zero",
        wishId: wish.id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      wishes.linkFruit(seed.guardian, {
        fruitCollectionId: "missing",
        quantity: 1,
        requestId: "wish-link-missing",
        wishId: wish.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      wishes.linkFruit(seed.guardian, {
        fruitCollectionId: seed.harvest.fruit.id,
        quantity: 2,
        requestId: "wish-link-insufficient",
        wishId: wish.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      wishes.fulfillWish(seed.guardian, { requestId: "wish-fulfill-empty", wishId: wish.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await wishes.linkFruit(seed.guardian, {
      fruitCollectionId: seed.harvest.fruit.id,
      quantity: 1,
      requestId: "wish-link-valid",
      wishId: wish.id,
    });
    await expect(
      wishes.archiveWish(seed.guardian, { requestId: "wish-archive-reserved", wishId: wish.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      wishes.unlinkFruit(seed.guardian, {
        fruitCollectionId: seed.harvest.fruit.id,
        quantity: 2,
        requestId: "wish-unlink-excess",
        wishId: wish.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const platform: ActorContext = { accountId: "platform", mode: "PLATFORM" };
    await expect(wishes.familyWishView(platform, seed.firstChild.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      wishes.familyWishView({ ...seed.childActor, childId: "other" }, seed.firstChild.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
