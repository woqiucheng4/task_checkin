import { describe, expect, it, vi } from "vitest";

import { MediaService } from "../../src/application/media-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";

async function draftScenario() {
  const seed = await createIdentityScenario(1);
  const storage = new FakeVerifiedMediaStorage();
  const ocr = new FakeOcrProvider({
    confidence: 0.91,
    provider: "fake-ocr",
    providerVersion: "1.0",
    title: "完成数学练习册",
  });
  const media = new MediaService(seed.harness, storage, ocr);
  const upload = await media.createUploadIntent(seed.teacher, {
    byteSize: 512_000,
    mimeType: "image/jpeg",
    ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
    purpose: "TASK_SOURCE",
    requestId: "draft-upload-intent",
    retentionDays: 90,
  });
  await media.uploadContent(seed.teacher, {
    assetId: upload.asset.id,
    base64: Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(511_997)]).toString("base64"),
    requestId: "draft-upload-recorded",
  });
  return { ...seed, media, ocr, storage, upload };
}

describe("OCR task drafts", () => {
  async function confirmedDraft() {
    const seed = await draftScenario();
    const draft = await seed.media.recognizeTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "concurrent-draft-recognize",
    });
    await seed.media.editDraft(seed.teacher, {
      draftId: draft.id,
      category: "MATHEMATICS",
      startsAt: "2026-09-05T10:00:00.000Z",
      dueAt: "2026-09-05T13:00:00.000Z",
      submissionMode: "PHOTO",
      requestId: "concurrent-draft-edit",
    });
    const input = {
      draftId: draft.id,
      allowLateSubmission: true,
      estimatedMinutes: 20,
      groupId: seed.group.id,
      importance: "REQUIRED" as const,
      occurrenceDate: "2026-09-05",
      requiresAcademicReview: true,
      schedule: { kind: "ONCE" as const, date: "2026-09-05" },
    };
    return { ...seed, draft, input };
  }

  it("publishes one task and assignment for concurrent requests with different IDs and returns the same result on retry", async () => {
    const seed = await confirmedDraft();
    const results = await Promise.all([
      seed.media.publishDraft(seed.teacher, {
        ...seed.input,
        requestId: "concurrent-publish-first",
      }),
      seed.media.publishDraft(seed.teacher, {
        ...seed.input,
        requestId: "concurrent-publish-second",
      }),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(
      seed.media.publishDraft(seed.teacher, {
        ...seed.input,
        requestId: "concurrent-publish-retry",
      }),
    ).resolves.toEqual(results[0]);
    expect(await seed.harness.repository.query("tasks")).toHaveLength(1);
    expect(await seed.harness.repository.query("taskAssignments")).toHaveLength(1);
    expect(
      await seed.harness.repository.query("auditLogs", { action: "TASK_DRAFT_PUBLISHED" }),
    ).toHaveLength(1);
  });

  it("rolls task and assignment writes back when marking the draft published fails", async () => {
    const seed = await confirmedDraft();
    const transaction = seed.harness.repository.transaction.bind(seed.harness.repository);
    vi.spyOn(seed.harness.repository, "transaction").mockImplementationOnce((work) =>
      transaction(async (tx) => {
        const update = tx.update.bind(tx);
        tx.update = async (collection, id, patch) => {
          if (collection === "taskDrafts") throw new Error("injected publish failure");
          return update(collection, id, patch);
        };
        return work(tx);
      }),
    );
    await expect(
      seed.media.publishDraft(seed.teacher, { ...seed.input, requestId: "atomic-publish-failure" }),
    ).rejects.toThrow("injected publish failure");
    expect(await seed.harness.repository.query("tasks")).toEqual([]);
    expect(await seed.harness.repository.query("taskAssignments")).toEqual([]);
    expect(await seed.harness.repository.read("taskDrafts", seed.draft.id)).toMatchObject({
      status: "DRAFT",
    });
    await expect(
      seed.media.publishDraft(seed.teacher, { ...seed.input, requestId: "atomic-publish-retry" }),
    ).resolves.toMatchObject({ draftId: seed.draft.id });
  });

  it("requires the adult creator and matching source uploader even for other staff or administrators", async () => {
    const seed = await confirmedDraft();
    const other = { accountId: "other-draft-teacher", mode: "ACCOUNT" as const };
    const member = (
      await seed.harness.repository.query("organizationMembers", {
        accountId: seed.teacher.accountId,
      })
    )[0]!;
    await seed.harness.repository.transaction((tx) =>
      tx.insert("organizationMembers", {
        ...member,
        id: "other-draft-staff",
        organizationMemberId: "other-draft-member",
        accountId: other.accountId,
        organizationRole: "STAFF",
      }),
    );
    for (const actor of [
      other,
      {
        ...seed.teacher,
        mode: "CHILD" as const,
        childId: seed.firstChild.id,
      } as unknown as import("../../src/domain/model.js").ActorContext,
    ]) {
      await expect(
        seed.media.editDraft(actor, {
          draftId: seed.draft.id,
          title: "unauthorized change",
          requestId: "forbidden-draft-edit",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        seed.media.publishDraft(actor, { ...seed.input, requestId: "forbidden-draft-publish" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await seed.harness.repository.transaction((tx) =>
      tx.update("organizationMembers", "other-draft-staff", {
        organizationRole: "ORGANIZATION_ADMIN",
      }),
    );
    await expect(
      seed.media.editDraft(other, {
        draftId: seed.draft.id,
        title: "admin overwrite",
        requestId: "forbidden-admin-draft",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await seed.harness.repository.transaction((tx) =>
      tx.update("mediaAssets", seed.upload.asset.id, { uploaderAccountId: other.accountId }),
    );
    await expect(
      seed.media.editDraft(seed.teacher, {
        draftId: seed.draft.id,
        title: "mismatched source",
        requestId: "forbidden-mismatch-draft",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await seed.harness.repository.query("tasks")).toEqual([]);
  });

  it("stores recognition output as an editable draft and never publishes automatically", async () => {
    const seed = await draftScenario();

    const draft = await seed.media.recognizeTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "draft-recognize-1",
    });

    expect(draft).toMatchObject({
      confidence: 0.91,
      provider: "fake-ocr",
      status: "DRAFT",
      title: "完成数学练习册",
    });
    expect(await seed.harness.repository.query("tasks", { draftId: draft.id })).toHaveLength(0);
    expect(seed.ocr.calls).toHaveLength(1);
    expect(seed.ocr.calls[0]).toMatchObject({
      mimeType: "image/jpeg",
      requestId: "draft-recognize-1",
    });
  });

  it("refuses to publish until an adult confirms all required fields", async () => {
    const seed = await draftScenario();
    const draft = await seed.media.recognizeTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "draft-recognize-incomplete",
    });

    await expect(
      seed.media.publishDraft(seed.teacher, {
        allowLateSubmission: true,
        draftId: draft.id,
        estimatedMinutes: 20,
        groupId: seed.group.id,
        importance: "REQUIRED",
        occurrenceDate: "2026-09-05",
        requestId: "draft-publish-incomplete",
        requiresAcademicReview: true,
        schedule: { kind: "ONCE", date: "2026-09-05" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("publishes only after the adult edits and confirms the draft", async () => {
    const seed = await draftScenario();
    const draft = await seed.media.recognizeTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "draft-recognize-complete",
    });
    await seed.media.editDraft(seed.teacher, {
      category: "MATHEMATICS",
      draftId: draft.id,
      dueAt: "2026-09-05T13:00:00.000Z",
      requestId: "draft-edit-complete",
      startsAt: "2026-09-05T10:00:00.000Z",
      submissionMode: "PHOTO",
      title: "数学练习册第 12 页",
    });

    const task = await seed.media.publishDraft(seed.teacher, {
      allowLateSubmission: true,
      draftId: draft.id,
      estimatedMinutes: 20,
      groupId: seed.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requestId: "draft-publish-complete",
      requiresAcademicReview: true,
      schedule: { kind: "ONCE", date: "2026-09-05" },
    });

    expect(task).toMatchObject({ draftId: draft.id, status: "PUBLISHED" });
    expect(await seed.harness.repository.read("taskDrafts", draft.id)).toMatchObject({
      status: "PUBLISHED",
    });
  });

  it("retains every publisher-owned task source selected while reviewing a draft", async () => {
    const seed = await draftScenario();
    const draft = await seed.media.recognizeTaskDraft(seed.teacher, {
      assetId: seed.upload.asset.id,
      requestId: "draft-recognize-multiple-sources",
    });
    const extra = await seed.media.createUploadIntent(seed.teacher, {
      byteSize: 512_000,
      mimeType: "image/jpeg",
      ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
      purpose: "TASK_SOURCE",
      requestId: "draft-extra-source-intent",
      retentionDays: 90,
    });
    await seed.media.uploadContent(seed.teacher, {
      assetId: extra.asset.id,
      base64: Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(511_997)]).toString(
        "base64",
      ),
      requestId: "draft-extra-source-upload",
    });
    await seed.media.editDraft(seed.teacher, {
      category: "MATHEMATICS",
      draftId: draft.id,
      dueAt: "2026-09-05T13:00:00.000Z",
      requestId: "draft-edit-multiple-sources",
      startsAt: "2026-09-05T10:00:00.000Z",
      submissionMode: "PHOTO",
      title: "两张题图",
    });

    const task = await seed.media.publishDraft(seed.teacher, {
      allowLateSubmission: true,
      draftId: draft.id,
      estimatedMinutes: 20,
      groupId: seed.group.id,
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requestId: "draft-publish-multiple-sources",
      requiresAcademicReview: true,
      schedule: { kind: "ONCE", date: "2026-09-05" },
      sourceAssetIds: [draft.sourceAssetId, extra.asset.id],
    });

    expect(task.sourceAssetIds).toEqual([draft.sourceAssetId, extra.asset.id]);
  });
});
