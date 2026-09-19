import { describe, expect, it, vi } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { TaskService } from "../../src/application/task-service.js";
import { MediaService, type UploadIntentResult } from "../../src/application/media-service.js";
import type { TaskInstanceState } from "../../src/domain/model.js";
import { SunlightService } from "../../src/application/sunlight-service.js";
import { addDays } from "../../src/domain/media.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";

const fields = {
  allowLateSubmission: true,
  category: "LIFE" as const,
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 10,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  requiresAcademicReview: true,
  schedule: { kind: "ONCE" as const, date: "2026-09-05" },
  startsAt: "2026-09-05T08:00:00.000Z",
  submissionMode: "TEXT" as const,
  title: "私密练习",
};
const jpeg = Buffer.from([255, 216, 255, 0]).toString("base64");
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("isolation fixture missing");
  return value;
}

async function setup() {
  const seed = await createIdentityScenario(2);
  const task = await new TaskService(seed.harness).publishGroupTask(seed.teacher, {
    ...fields,
    groupId: seed.group.id,
    requestId: "isolation-publish",
  });
  const assignment = required(
    (
      await seed.harness.repository.query("taskAssignments", {
        taskId: task.id,
        childId: seed.firstChild.id,
      })
    )[0],
  );
  const storage = new FakeVerifiedMediaStorage();
  const signed = vi.fn(async () => "https://private.invalid/signed");
  const api = createCoreApi({
    ...seed.harness,
    taskDraftProvider: new FakeOcrProvider({
      confidence: 1,
      provider: "fake",
      providerVersion: "1",
    }),
    mediaStorage: Object.assign(storage, { downloadUrl: signed }),
  });
  const media = new MediaService(
    seed.harness,
    storage,
    new FakeOcrProvider({ confidence: 1, provider: "fake", providerVersion: "1" }),
  );
  const childA = { mode: "CHILD" as const, childId: seed.firstChild.id };
  const childB = { mode: "CHILD" as const, childId: required(seed.children[1]).id };
  async function call(
    action: string,
    payload: object,
    requestId = `isolation-${action}`,
    actor = childA,
  ) {
    return api.handle(
      { action, payload, requestId: requestId.replaceAll("_", "-"), actor },
      { openId: "wx-scenario-guardian" },
    );
  }
  async function evidence() {
    const result = await call("CREATE_UPLOAD_INTENT", {
      assignmentId: assignment.id,
      purpose: "SUBMISSION_EVIDENCE",
      retentionDays: 90,
      mimeType: "image/jpeg",
      byteSize: 4,
    });
    expect(result.ok).toBe(true);
    return (result as { data: UploadIntentResult }).data.asset;
  }
  return { ...seed, task, assignment, storage, signed, api, media, childA, childB, call, evidence };
}

describe("final shared-account and withdrawal boundaries", () => {
  it.each(["SUBMIT_TASK", "SUPPLEMENT_SUBMISSION"])(
    "%s reauthorizes sibling replay and serializes valid retries",
    async (action) => {
      const s = await setup();
      if (action === "SUPPLEMENT_SUBMISSION")
        await s.harness.repository.transaction((tx) =>
          tx.update("taskAssignments", s.assignment.id, { taskState: "REVISION_REQUIRED" }),
        );
      const payload = { assignmentId: s.assignment.id, text: "A-only secret", mediaAssetIds: [] };
      const first = await s.call(action, payload);
      expect(first, JSON.stringify(first)).toMatchObject({ ok: true });
      const sibling = await s.call(action, payload, `isolation-${action}`, s.childB);
      expect(sibling).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(JSON.stringify(sibling)).not.toContain("A-only secret");
      expect(JSON.stringify(sibling)).not.toContain(s.assignment.id);
      expect(await s.call(action, payload)).toEqual(first);
      expect(
        await s.harness.repository.query("submissions", { assignmentId: s.assignment.id }),
      ).toHaveLength(1);
      expect(await s.harness.repository.query("commandReceipts", { action })).toHaveLength(0);
    },
  );

  it("concurrent submit retries produce one submission", async () => {
    const s = await setup();
    const payload = { assignmentId: s.assignment.id, text: "A-only secret", mediaAssetIds: [] };
    const results = await Promise.all([
      s.call("SUBMIT_TASK", payload),
      s.call("SUBMIT_TASK", payload),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(
      await s.harness.repository.query("submissions", { assignmentId: s.assignment.id }),
    ).toHaveLength(1);
  });

  it("authorizes child/guardian at intent and upload, including cached retries", async () => {
    const s = await setup();
    const asset = await s.evidence();
    expect((await s.evidence()).id).toBe(asset.id);
    expect(await s.harness.repository.query("mediaAssets")).toHaveLength(1);
    const payload = {
      assignmentId: s.assignment.id,
      purpose: "SUBMISSION_EVIDENCE",
      retentionDays: 90,
      mimeType: "image/jpeg",
      byteSize: 4,
    };
    expect(
      await s.call("CREATE_UPLOAD_INTENT", payload, "isolation-CREATE_UPLOAD_INTENT", s.childB),
    ).toMatchObject({ ok: false });
    expect(
      await s.call(
        "UPLOAD_MEDIA_CONTENT",
        { assetId: asset.id, base64: jpeg },
        "sibling-fresh-upload",
        s.childB,
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await s.harness.repository.read("mediaAssets", asset.id)).toMatchObject({
      status: "PENDING_UPLOAD",
    });
    expect(await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg })).toMatchObject(
      { ok: true },
    );
    expect(
      await s.call(
        "UPLOAD_MEDIA_CONTENT",
        { assetId: asset.id, base64: jpeg },
        "isolation-UPLOAD_MEDIA_CONTENT",
        s.childB,
      ),
    ).toMatchObject({ ok: false });
    const guardianIntent = await s.api.handle(
      { action: "CREATE_UPLOAD_INTENT", payload, requestId: "guardian-evidence-intent" },
      { openId: "wx-scenario-guardian" },
    );
    expect(guardianIntent).toMatchObject({ ok: true });
    const guardianAsset = (guardianIntent as { data: UploadIntentResult }).data.asset;
    expect(
      await s.api.handle(
        {
          action: "UPLOAD_MEDIA_CONTENT",
          payload: { assetId: guardianAsset.id, base64: jpeg },
          requestId: "guardian-evidence-upload",
        },
        { openId: "wx-scenario-guardian" },
      ),
    ).toMatchObject({ ok: true });
  });

  it("rejects sibling attachment and late-challenge receipt replay", async () => {
    const s = await setup();
    const asset = await s.evidence();
    await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
    await s.call("SUBMIT_TASK", {
      assignmentId: s.assignment.id,
      text: "A-only secret",
      mediaAssetIds: [],
    });
    const submission = required(
      (await s.harness.repository.query("submissions", { assignmentId: s.assignment.id }))[0],
    );
    for (const [action, payload] of [
      ["ATTACH_SUBMISSION_EVIDENCE", { submissionId: submission.id, assetId: asset.id }],
      ["ACCEPT_LATE_CHALLENGE", { assignmentId: s.assignment.id }],
    ] as const) {
      expect(await s.call(action, payload)).toMatchObject({ ok: true });
      expect(await s.call(action, payload, `isolation-${action}`, s.childB)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    }
  });

  it("binds tree start, rename and harvest retries to the selected child", async () => {
    const s = await setup();
    const start = await s.call("START_TREE", { catalogId: "starter-apple" });
    expect(start).toMatchObject({ ok: true });
    expect(await s.call("START_TREE", { catalogId: "starter-apple" })).toEqual(start);
    const other = await s.call(
      "START_TREE",
      { catalogId: "starter-apple" },
      "isolation-START_TREE",
      s.childB,
    );
    expect(other).toMatchObject({ ok: true, data: { childId: s.childB.childId } });
    expect(other).not.toEqual(start);
    const tree = required(
      (await s.harness.repository.query("childTrees", { childId: s.firstChild.id }))[0],
    );
    await new SunlightService(s.harness).grantForAssignment(s.platform, {
      assignmentId: s.assignment.id,
      amount: 6,
      reason: "MANUAL_CORRECTION",
      requestId: "isolation-mature-tree",
    });
    for (const action of ["RENAME_TREE", "HARVEST_TREE"]) {
      const payload = { treeId: tree.id, name: "A-only tree" };
      const first = await s.call(action, payload);
      expect(first).toMatchObject({ ok: true });
      expect(await s.call(action, payload)).toEqual(first);
      expect(await s.call(action, payload, `isolation-${action}`, s.childB)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    }
    expect(await s.harness.repository.query("growthCards", { treeId: tree.id })).toHaveLength(1);
  });

  it.each(["TEACHER", "ASSISTANT", "ORGANIZATION_ADMIN"] as const)(
    "allows active adult %s to read detail, queue and signed evidence",
    async (role) => {
      const s = await setup();
      const asset = await s.evidence();
      await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
      await s.call("SUBMIT_TASK", {
        assignmentId: s.assignment.id,
        text: "A-only secret",
        mediaAssetIds: [asset.id],
      });
      await s.harness.repository.transaction(async (tx) => {
        for (const member of await tx.query("organizationMembers", {
          accountId: s.teacher.accountId,
        }))
          await tx.update("organizationMembers", member.id, {
            organizationRole: role === "ORGANIZATION_ADMIN" ? role : "STAFF",
          });
        for (const binding of await tx.query("groupRoleBindings", {
          accountId: s.teacher.accountId,
        }))
          await tx.update(
            "groupRoleBindings",
            binding.id,
            role === "ORGANIZATION_ADMIN" ? { status: "WITHDRAWN" } : { role },
          );
      });
      for (const [action, payload] of [
        ["GET_ASSIGNMENT_DETAIL", { assignmentId: s.assignment.id }],
        ["GET_REVIEW_QUEUE", { kind: "GROUP", groupId: s.group.id }],
        ["READ_MEDIA_ASSET", { assetId: asset.id }],
      ] as const)
        expect(
          await s.api.handle({ action, payload }, { openId: "wx-scenario-teacher" }),
        ).toMatchObject({ ok: true });
      expect(s.signed).toHaveBeenCalledOnce();
    },
  );

  it("reauthorizes task-source intent and confirmation after adult membership withdrawal", async () => {
    const s = await setup();
    const input = {
      ownerScope: { kind: "ORGANIZATION" as const, organizationId: s.organization.id },
      purpose: "TASK_SOURCE" as const,
      retentionDays: 90,
      mimeType: "image/jpeg",
      byteSize: 4,
    };
    const command = {
      action: "CREATE_UPLOAD_INTENT",
      payload: input,
      requestId: "source-create-original",
    };
    const intent = await s.api.handle(command, { openId: "wx-scenario-teacher" });
    expect(intent).toMatchObject({ ok: true });
    const asset = (intent as { data: UploadIntentResult }).data.asset;
    expect(await s.call("CREATE_UPLOAD_INTENT", input)).toMatchObject({ ok: false });
    await s.harness.repository.transaction(async (tx) => {
      for (const member of await tx.query("organizationMembers", {
        accountId: s.teacher.accountId,
      }))
        await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
    });
    expect(await s.api.handle(command, { openId: "wx-scenario-teacher" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(
      await s.api.handle(
        {
          action: "UPLOAD_MEDIA_CONTENT",
          payload: { assetId: asset.id, base64: jpeg },
          requestId: "revoked-source-confirm",
        },
        { openId: "wx-scenario-teacher" },
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await s.harness.repository.read("mediaAssets", asset.id)).toMatchObject({
      status: "PENDING_UPLOAD",
    });
  });

  it("rejects upload activation when consent is withdrawn while storage upload is in flight", async () => {
    const s = await setup();
    const asset = await s.evidence();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upload = s.storage.upload.bind(s.storage);
    vi.spyOn(s.storage, "upload").mockImplementation(async (key, content) => {
      entered();
      await blocked;
      return upload(key, content);
    });
    const pending = s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
    await started;
    await s.invitations.withdrawChild(s.guardian, {
      childGroupMembershipId: required(s.memberships[0]).id,
      requestId: "withdraw-during-upload",
    });
    release();
    expect(await pending).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await s.harness.repository.read("mediaAssets", asset.id)).toMatchObject({
      status: "PENDING_UPLOAD",
    });
  });

  it.each(["membership", "binding", "organization", "group", "non-adult"])(
    "revokes all institution content reads when %s becomes inactive",
    async (revoked) => {
      const s = await setup();
      const asset = await s.evidence();
      await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
      await s.call("SUBMIT_TASK", {
        assignmentId: s.assignment.id,
        text: "A-only secret",
        mediaAssetIds: [asset.id],
      });
      const member = required(
        (
          await s.harness.repository.query("organizationMembers", {
            accountId: s.teacher.accountId,
          })
        )[0],
      );
      await s.harness.repository.transaction(async (tx) => {
        await tx.update("organizationMembers", member.id, { organizationRole: "STAFF" });
        if (revoked === "membership")
          await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
        if (revoked === "non-adult")
          await tx.update("organizationMembers", member.id, { memberType: "CHILD" });
        if (revoked === "binding")
          for (const binding of await tx.query("groupRoleBindings", {
            accountId: s.teacher.accountId,
          }))
            await tx.update("groupRoleBindings", binding.id, { status: "WITHDRAWN" });
        if (revoked === "organization")
          await tx.update("organizations", s.organization.id, { status: "INACTIVE" });
        if (revoked === "group") await tx.update("groups", s.group.id, { status: "INACTIVE" });
      });
      for (const [action, payload] of [
        ["GET_ASSIGNMENT_DETAIL", { assignmentId: s.assignment.id }],
        ["GET_REVIEW_QUEUE", { kind: "GROUP", groupId: s.group.id }],
        ["READ_MEDIA_ASSET", { assetId: asset.id }],
      ] as const) {
        const result = await s.api.handle({ action, payload }, { openId: "wx-scenario-teacher" });
        expect(result).toMatchObject({ ok: false });
        expect(JSON.stringify(result)).not.toMatch(/A-only secret|孩子1|private.invalid/);
      }
      expect(s.signed).not.toHaveBeenCalled();
    },
  );

  it.each(["PENDING", "SUBMITTED", "REVIEWING"] as const)(
    "retains evidence for %s at day 92 and 90 days after completion",
    async (taskState) => {
      const s = await setup();
      const asset = await s.evidence();
      await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
      // REVIEWING is also retained defensively for legacy/future stored states.
      await s.harness.repository.transaction((tx) =>
        tx.update("taskAssignments", s.assignment.id, {
          taskState: taskState as TaskInstanceState,
        }),
      );
      s.harness.clock.set(addDays(asset.createdAt, 92));
      expect(
        await s.media.deleteExpiredAssets(s.platform, { requestId: "evidence-retain-open" }),
      ).toEqual({ deletedCount: 0 });
      const completedAt = s.harness.clock.now();
      await s.harness.repository.transaction((tx) =>
        tx.update("taskAssignments", s.assignment.id, {
          taskState: "COMPLETED",
          updatedAt: completedAt,
        }),
      );
      s.harness.clock.set(addDays(completedAt, 89));
      expect(
        await s.media.deleteExpiredAssets(s.platform, { requestId: "evidence-retain-89" }),
      ).toEqual({ deletedCount: 0 });
      s.harness.clock.set(addDays(completedAt, 91));
      expect(
        await s.media.deleteExpiredAssets(s.platform, { requestId: "evidence-delete-91" }),
      ).toEqual({ deletedCount: 1 });
    },
  );

  it("withdrawal immediately before publication transaction prevents assignment creation", async () => {
    const s = await setup();
    const original = s.harness.repository.transaction.bind(s.harness.repository);
    let first = true;
    vi.spyOn(s.harness.repository, "transaction").mockImplementation(async (work) => {
      if (first) {
        first = false;
        await s.invitations.withdrawChild(s.guardian, {
          childGroupMembershipId: required(s.memberships[0]).id,
          requestId: "withdraw-before-publish",
        });
      }
      return original(work);
    });
    const task = await new TaskService(s.harness).publishGroupTask(s.teacher, {
      ...fields,
      groupId: s.group.id,
      requestId: "publish-after-withdraw",
    });
    expect(
      await s.harness.repository.query("taskAssignments", {
        taskId: task.id,
        childId: s.firstChild.id,
      }),
    ).toHaveLength(0);
    expect(await s.harness.repository.query("taskAssignments", { taskId: task.id })).toHaveLength(
      1,
    );
  });

  it("checks publisher membership inside the publication transaction", async () => {
    const s = await setup();
    const original = s.harness.repository.transaction.bind(s.harness.repository);
    vi.spyOn(s.harness.repository, "transaction").mockImplementationOnce(async (work) => {
      await original(async (tx) => {
        for (const member of await tx.query("organizationMembers", {
          accountId: s.teacher.accountId,
        }))
          await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
      });
      return original(work);
    });
    await expect(
      new TaskService(s.harness).publishGroupTask(s.teacher, {
        ...fields,
        groupId: s.group.id,
        requestId: "publish-revoked-teacher",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await s.harness.repository.query("tasks")).toHaveLength(1);
    expect(await s.harness.repository.query("taskAssignments")).toHaveLength(2);
  });

  it.each(["guardian", "member", "withdrawal"] as const)(
    "draft publication rereads %s recipients after entering its transaction",
    async (revoked) => {
      const s = await setup();
      const intent = await s.media.createUploadIntent(s.teacher, {
        purpose: "TASK_SOURCE",
        ownerScope: { kind: "ORGANIZATION", organizationId: s.organization.id },
        retentionDays: 90,
        byteSize: 4,
        mimeType: "image/jpeg",
        requestId: "draft-isolation-source",
      });
      await s.media.uploadContent(s.teacher, {
        assetId: intent.asset.id,
        base64: jpeg,
        requestId: "draft-isolation-upload",
      });
      const now = s.harness.clock.now();
      await s.harness.repository.transaction((tx) =>
        tx.insert("taskDrafts", {
          id: "isolation-draft",
          ownerScope: intent.asset.ownerScope,
          sourceAssetId: intent.asset.id,
          createdByAccountId: s.teacher.accountId,
          provider: "fixture",
          providerVersion: "1",
          confidence: 1,
          status: "DRAFT",
          createdAt: now,
          updatedAt: now,
          title: fields.title,
          category: fields.category,
          startsAt: fields.startsAt,
          dueAt: fields.dueAt,
          submissionMode: fields.submissionMode,
        }),
      );
      const original = s.harness.repository.transaction.bind(s.harness.repository);
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let release!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(s.harness.repository, "transaction").mockImplementationOnce(async (work) => {
        entered();
        await blocked;
        return original(work);
      });
      const pending = s.media.publishDraft(s.teacher, {
        ...fields,
        groupId: s.group.id,
        draftId: "isolation-draft",
        requestId: "draft-after-withdraw",
      });
      // Observe rejection immediately so an expected authorization error is handled.
      const outcome = pending.then(
        (task) => ({ task }),
        (error) => ({ error }),
      );
      await started;
      if (revoked === "withdrawal")
        await s.invitations.withdrawChild(s.guardian, {
          childGroupMembershipId: required(s.memberships[0]).id,
          requestId: "draft-withdraw-before-tx",
        });
      else
        await original(async (tx) => {
          if (revoked === "guardian")
            for (const guardian of await tx.query("guardianLinks", { childId: s.firstChild.id }))
              await tx.update("guardianLinks", guardian.id, { status: "WITHDRAWN" });
          if (revoked === "member")
            for (const member of await tx.query("organizationMembers", {
              childId: s.firstChild.id,
            }))
              await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
        });
      release();
      const result = await outcome;
      if (revoked === "guardian") {
        expect(result).toMatchObject({ error: { code: "CONFLICT" } });
        expect(
          await s.harness.repository.query("tasks", { draftId: "isolation-draft" }),
        ).toHaveLength(0);
        expect(await s.harness.repository.read("taskDrafts", "isolation-draft")).toMatchObject({
          status: "DRAFT",
        });
      } else {
        if (!("task" in result)) throw result.error;
        expect(
          await s.harness.repository.query("taskAssignments", {
            taskId: result.task.id,
            childId: s.firstChild.id,
          }),
        ).toHaveLength(0);
        expect(
          await s.harness.repository.query("taskAssignments", { taskId: result.task.id }),
        ).toHaveLength(1);
      }
    },
  );

  it("retains evidence until every linked assignment is terminal, and retries a failed deletion", async () => {
    const s = await setup();
    const asset = await s.evidence();
    await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
    await s.call("SUBMIT_TASK", {
      assignmentId: s.assignment.id,
      text: "A-only secret",
      mediaAssetIds: [asset.id],
    });
    const other = required(
      (await s.harness.repository.query("taskAssignments", { childId: s.childB.childId }))[0],
    );
    await s.harness.repository.transaction(async (tx) => {
      await tx.update("taskAssignments", s.assignment.id, { taskState: "COMPLETED" });
      // Legacy links must also hold retention, even if the current intent binds one assignment.
      await tx.insert("submissionEvidenceLinks", {
        id: "legacy-shared-evidence-link",
        assignmentId: other.id,
        childId: other.childId,
        submissionId: "legacy-submission",
        mediaAssetId: asset.id,
        requestId: "legacy-evidence-link",
        createdAt: asset.createdAt,
      });
    });
    s.harness.clock.set(addDays(asset.createdAt, 100));
    expect(
      await s.media.deleteExpiredAssets(s.platform, { requestId: "retain-second-assignment" }),
    ).toEqual({ deletedCount: 0 });
    const completedAt = s.harness.clock.now();
    await s.harness.repository.transaction((tx) =>
      tx.update("taskAssignments", other.id, { taskState: "COMPLETED", updatedAt: completedAt }),
    );
    s.harness.clock.set(addDays(completedAt, 89));
    expect(
      await s.media.deleteExpiredAssets(s.platform, { requestId: "retain-last-completed-89" }),
    ).toEqual({ deletedCount: 0 });
    s.harness.clock.set(addDays(completedAt, 91));
    vi.spyOn(s.storage, "delete").mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      s.media.deleteExpiredAssets(s.platform, { requestId: "delete-fails-safe" }),
    ).rejects.toThrow("storage unavailable");
    expect(await s.harness.repository.read("mediaAssets", asset.id)).toMatchObject({
      status: "DELETING",
    });
    expect(
      await s.api.handle(
        { action: "READ_MEDIA_ASSET", payload: { assetId: asset.id } },
        { openId: "wx-scenario-guardian" },
      ),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(s.signed).not.toHaveBeenCalled();
    expect(
      await s.media.deleteExpiredAssets(s.platform, { requestId: "delete-success-retry" }),
    ).toEqual({ deletedCount: 1 });
  });

  it("expires legacy unassociated evidence 90 days after upload", async () => {
    const s = await setup();
    const asset = await s.evidence();
    s.harness.clock.set(addDays(asset.createdAt, 10));
    await s.call("UPLOAD_MEDIA_CONTENT", { assetId: asset.id, base64: jpeg });
    const uploadedAt = s.harness.clock.now();
    await s.harness.repository.transaction((tx) =>
      tx.update("mediaAssets", asset.id, (current) => {
        const { assignmentId: _assignmentId, ...unassociated } = current;
        return unassociated;
      }),
    );
    s.harness.clock.set(addDays(uploadedAt, 89));
    expect(
      await s.media.deleteExpiredAssets(s.platform, { requestId: "unassociated-evidence-89" }),
    ).toEqual({ deletedCount: 0 });
    s.harness.clock.set(addDays(uploadedAt, 91));
    expect(
      await s.media.deleteExpiredAssets(s.platform, { requestId: "unassociated-evidence-91" }),
    ).toEqual({ deletedCount: 1 });
  });
});
