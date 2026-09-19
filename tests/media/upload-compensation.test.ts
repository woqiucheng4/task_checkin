import { describe, expect, it, vi } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { MediaService } from "../../src/application/media-service.js";
import { SubmissionService } from "../../src/application/submission-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { addDays } from "../../src/domain/media.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup() {
  const seed = await createIdentityScenario(1);
  const tasks = new TaskService(seed.harness);
  const task = await tasks.publishGroupTask(seed.teacher, {
    allowLateSubmission: true,
    category: "LIFE",
    dueAt: "2027-09-05T13:00:00.000Z",
    estimatedMinutes: 10,
    importance: "REQUIRED",
    occurrenceDate: "2026-09-05",
    requiresAcademicReview: true,
    schedule: { kind: "ONCE", date: "2026-09-05" },
    startsAt: "2026-09-05T08:00:00.000Z",
    submissionMode: "PHOTO",
    title: "照片练习",
    groupId: seed.group.id,
    requestId: "upload-compensation-task",
  });
  const assignment = (
    await seed.harness.repository.query("taskAssignments", { taskId: task.id })
  )[0];
  if (!assignment) throw new Error("assignment missing");
  const storage = new FakeVerifiedMediaStorage();
  const provider = new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" });
  const media = new MediaService(seed.harness, storage, provider);
  const actor = {
    accountId: seed.guardian.accountId,
    mode: "ACCOUNT" as const,
  };
  const { asset } = await media.createUploadIntent(actor, {
    childId: seed.firstChild.id,
    assignmentId: assignment.id,
    purpose: "SUBMISSION_EVIDENCE",
    retentionDays: 90,
    byteSize: 4,
    mimeType: "image/jpeg",
    requestId: "upload-compensation-intent",
  });
  const fileId = `cloud://test/${asset.storageKey}`;
  const api = createCoreApi({
    ...seed.harness,
    mediaStorage: storage,
    taskDraftProvider: provider,
  });
  const command = {
    action: "UPLOAD_MEDIA_CONTENT",
    actor: { mode: "ACCOUNT" },
    payload: {
      childId: seed.firstChild.id,
      assetId: asset.id,
      base64: Buffer.from([255, 216, 255, 0]).toString("base64"),
    },
    requestId: "upload-compensation-confirm",
  };
  const upload = () => api.handle(command, { openId: "wx-scenario-guardian" });
  const submit = () =>
    new SubmissionService(seed.harness).submit(actor, {
      childId: seed.firstChild.id,
      assignmentId: assignment.id,
      mediaAssetIds: [asset.id],
      requestId: "upload-compensation-submit",
    });
  const cleanup = () =>
    media.deleteExpiredAssets(seed.platform, { requestId: "upload-compensation-cleanup" });
  return {
    ...seed,
    actor,
    asset,
    assignment,
    fileId,
    storage,
    media,
    api,
    command,
    upload,
    submit,
    cleanup,
  };
}

describe("verified upload failure compensation", () => {
  it("persists revoked uploaded bytes as unreadable and physically deletes the orphan after timeout", async () => {
    const s = await setup();
    const entered = deferred();
    const release = deferred();
    const upload = s.storage.upload.bind(s.storage);
    vi.spyOn(s.storage, "upload").mockImplementation(async (key, bytes) => {
      const file = await upload(key, bytes);
      entered.resolve();
      await release.promise;
      return file;
    });
    const pending = s.upload();
    await entered.promise;
    expect(await s.storage.read(s.fileId)).toHaveLength(4);
    const membership = s.memberships[0];
    if (!membership) throw new Error("membership missing");
    await s.invitations.withdrawChild(s.guardian, {
      childGroupMembershipId: membership.id,
      requestId: "upload-compensation-withdraw",
    });
    release.resolve();
    expect(await pending).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await s.harness.repository.read("mediaAssets", s.asset.id)).toMatchObject({
      fileId: s.fileId,
      status: "QUARANTINED",
    });
    await expect(s.media.readAsset(s.guardian, s.asset.id, s.firstChild.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await s.upload()).toMatchObject({ ok: false });
    s.harness.clock.set(addDays(s.asset.createdAt, 91));
    expect(await s.cleanup()).toEqual({ deletedCount: 1 });
    expect(s.storage.deletedKeys).toEqual([s.fileId]);
    await expect(s.storage.read(s.fileId)).rejects.toThrow("missing private file");
    expect(await s.harness.repository.read("mediaAssets", s.asset.id)).toMatchObject({
      fileId: s.fileId,
      status: "DELETED",
    });
  });

  it("retains fileId after activation transaction failure and retries failed physical deletion", async () => {
    const s = await setup();
    const transaction = s.harness.repository.transaction.bind(s.harness.repository);
    vi.spyOn(s.harness.repository, "transaction").mockImplementation((work) =>
      transaction(async (tx) => {
        const update = tx.update.bind(tx);
        tx.update = async (collection, id, patch) => {
          if (
            collection === "mediaAssets" &&
            typeof patch !== "function" &&
            "status" in patch &&
            patch.status === "ACTIVE"
          )
            throw new Error("activation persistence failed");
          return update(collection, id, patch);
        };
        return work(tx);
      }),
    );
    expect(await s.upload()).toMatchObject({ ok: false });
    expect(await s.harness.repository.read("mediaAssets", s.asset.id)).toMatchObject({
      fileId: s.fileId,
      status: "QUARANTINED",
    });
    s.harness.clock.set(addDays(s.asset.createdAt, 91));
    vi.spyOn(s.storage, "delete").mockRejectedValueOnce(new Error("delete unavailable"));
    await expect(s.cleanup()).rejects.toThrow("delete unavailable");
    expect(await s.harness.repository.read("mediaAssets", s.asset.id)).toMatchObject({
      fileId: s.fileId,
      status: "DELETING",
    });
    expect(await s.storage.read(s.fileId)).toHaveLength(4);
    expect(await s.cleanup()).toEqual({ deletedCount: 1 });
    expect(s.storage.deletedKeys).toEqual([s.fileId]);
    await expect(s.storage.read(s.fileId)).rejects.toThrow("missing private file");
  });

  it("recovers a transient staging persistence error before activating the upload", async () => {
    const s = await setup();
    const transaction = s.harness.repository.transaction.bind(s.harness.repository);
    let failed = false;
    vi.spyOn(s.harness.repository, "transaction").mockImplementation((work) =>
      transaction(async (tx) => {
        const update = tx.update.bind(tx);
        tx.update = async (collection, id, patch) => {
          if (
            !failed &&
            collection === "mediaAssets" &&
            typeof patch !== "function" &&
            "status" in patch &&
            patch.status === "QUARANTINED"
          ) {
            failed = true;
            throw new Error("staging persistence failed once");
          }
          return update(collection, id, patch);
        };
        return work(tx);
      }),
    );
    expect(await s.upload()).toMatchObject({ ok: true });
    expect(failed).toBe(true);
    expect(await s.upload()).toMatchObject({ ok: true });
    await s.submit();
    s.harness.clock.set(addDays(s.asset.createdAt, 91));
    expect(await s.cleanup()).toEqual({ deletedCount: 0 });
    expect(await s.storage.read(s.fileId)).toHaveLength(4);
    expect(s.storage.deletedKeys).toEqual([]);
  });

  it("does not quarantine or delete a committed active upload when the transaction response fails", async () => {
    const s = await setup();
    const transaction = s.harness.repository.transaction.bind(s.harness.repository);
    let failed = false;
    vi.spyOn(s.harness.repository, "transaction").mockImplementation(async (work) => {
      const result = await transaction(work);
      const asset = await s.harness.repository.read("mediaAssets", s.asset.id);
      if (!failed && asset?.status === "ACTIVE") {
        failed = true;
        await s.submit();
        throw new Error("lost committed activation response");
      }
      return result;
    });
    expect(await s.upload()).toMatchObject({ ok: false });
    expect(await s.harness.repository.read("mediaAssets", s.asset.id)).toMatchObject({
      fileId: s.fileId,
      status: "ACTIVE",
    });
    s.harness.clock.set(addDays(s.asset.createdAt, 91));
    expect(await s.cleanup()).toEqual({ deletedCount: 0 });
    expect(await s.storage.read(s.fileId)).toHaveLength(4);
    expect(s.storage.deletedKeys).toEqual([]);
    expect(
      await s.harness.repository.query("submissionEvidenceLinks", { mediaAssetId: s.asset.id }),
    ).toHaveLength(1);
  });

  it("excludes cleanup and a second physical upload while the first upload is in flight", async () => {
    const s = await setup();
    const entered = deferred();
    const release = deferred();
    const original = s.storage.upload.bind(s.storage);
    const upload = vi.spyOn(s.storage, "upload").mockImplementation(async (key, bytes) => {
      entered.resolve();
      await release.promise;
      return original(key, bytes);
    });
    const pending = s.upload();
    await entered.promise;
    expect(await s.upload()).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    s.harness.clock.set(addDays(s.asset.createdAt, 91));
    expect(await s.cleanup()).toEqual({ deletedCount: 0 });
    expect(await s.harness.repository.read("mediaAssets", s.asset.id)).toMatchObject({
      status: "UPLOADING",
    });
    release.resolve();
    expect(await pending).toMatchObject({ ok: true });
    expect(upload).toHaveBeenCalledOnce();
    expect(s.storage.deletedKeys).toEqual([]);
    expect(await s.storage.read(s.fileId)).toHaveLength(4);
  });

  it("fails closed if a quarantined upload still has a committed submission reference", async () => {
    const s = await setup();
    expect(await s.upload()).toMatchObject({ ok: true });
    await s.submit();
    // Defensive recovery of legacy/inconsistent status must preserve live refs.
    await s.harness.repository.transaction((tx) =>
      tx.update("mediaAssets", s.asset.id, { status: "QUARANTINED" }),
    );
    s.harness.clock.set(addDays(s.asset.createdAt, 91));
    expect(await s.cleanup()).toEqual({ deletedCount: 0 });
    expect(await s.storage.read(s.fileId)).toHaveLength(4);
    expect(s.storage.deletedKeys).toEqual([]);
  });
});
