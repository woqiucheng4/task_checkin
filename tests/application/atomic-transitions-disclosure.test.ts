import { describe, expect, it } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { PresentationService } from "../../src/application/presentation-service.js";
import { MediaService } from "../../src/application/media-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";
import { FakeOcrProvider, FakeVerifiedMediaStorage } from "../helpers/media-fakes.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

describe("atomic transitions and current disclosure", () => {
  it.each(["FAMILY", "ORGANIZATION"] as const)(
    "deduplicates concurrent %s publication",
    async (source) => {
      const seed = await createSubmittedTaskScenario(source);
      const api = createCoreApi(seed.harness);
      const command = {
        action: source === "FAMILY" ? "PUBLISH_FAMILY_TASK" : "PUBLISH_GROUP_TASK",
        requestId: "concurrent-publication-001",
        payload: {
          ...seed.task,
          occurrenceDate: "2026-09-05",
          familyId: seed.family.id,
          childIds: [seed.firstChild.id],
          groupId: seed.group.id,
        },
      };
      const auth = { openId: source === "FAMILY" ? "wx-scenario-guardian" : "wx-scenario-teacher" };
      const results = await Promise.all([api.handle(command, auth), api.handle(command, auth)]);
      expect(results.every((result) => result.ok)).toBe(true);
      expect(results[0]).toEqual(results[1]);
      expect(await seed.harness.repository.query("tasks")).toHaveLength(2);
      expect(await api.handle(command, auth)).toEqual(results[0]);
      expect(
        (await api.handle({ ...command, requestId: "another-publication-001" }, auth)).ok,
      ).toBe(true);
      expect(await seed.harness.repository.query("tasks")).toHaveLength(3);
      await seed.harness.repository.transaction(async (tx) => {
        if (source === "FAMILY") {
          for (const link of await tx.query("guardianLinks", { childId: seed.firstChild.id }))
            await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
        } else {
          for (const member of await tx.query("organizationMembers", {
            accountId: seed.teacher.accountId,
          }))
            await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
        }
      });
      expect(await api.handle(command, auth)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
    },
  );

  it("serializes conflicting family reviews and reauthorizes old receipts", async () => {
    const seed = await createSubmittedTaskScenario();
    const api = createCoreApi(seed.harness);
    const command = {
      action: "FAMILY_REVIEW",
      requestId: "family-approval-atomic-01",
      payload: { assignmentId: seed.assignment.id, decision: "APPROVE" },
    };
    const auth = { openId: "wx-scenario-guardian" };
    const results = await Promise.all([
      api.handle(command, auth),
      api.handle(
        {
          ...command,
          requestId: "family-revision-atomic-01",
          payload: { ...command.payload, decision: "REVISION_REQUIRED" },
        },
        auth,
      ),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      await seed.harness.repository.query("reviewRecords", { assignmentId: seed.assignment.id }),
    ).toHaveLength(1);
    const current = await seed.harness.repository.read("taskAssignments", seed.assignment.id);
    expect(current?.rewardState === "GRANTED" && current.taskState === "REVISION_REQUIRED").toBe(
      false,
    );
    await seed.harness.repository.transaction(async (tx) => {
      for (const link of await tx.query("guardianLinks", { childId: seed.firstChild.id }))
        await tx.update("guardianLinks", link.id, { status: "WITHDRAWN" });
    });
    expect(await api.handle(command, auth)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("rejects academic approval and replay after organization child withdrawal", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const api = createCoreApi(seed.harness);
    const command = {
      action: "ACADEMIC_REVIEW",
      requestId: "child-membership-review-01",
      payload: { assignmentId: seed.assignment.id, decision: "APPROVE" },
    };
    expect((await api.handle(command, { openId: "wx-scenario-teacher" })).ok).toBe(true);
    await seed.harness.repository.transaction(async (tx) => {
      for (const member of await tx.query("organizationMembers", { childId: seed.firstChild.id }))
        await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
    });
    expect(await api.handle(command, { openId: "wx-scenario-teacher" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("uses current group disclosure for workspace, submissions and review labels", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const membership = seed.memberships[0];
    if (!membership) throw new Error("Missing membership");
    await seed.harness.repository.transaction((tx) =>
      tx.update("childGroupMemberships", membership.id, {
        disclosure: { displayName: false, grade: false, avatar: false },
      }),
    );
    const service = new PresentationService(seed.harness);
    const views = [
      await service.groupWorkspace(seed.teacher, { groupId: seed.group.id }),
      await service.groupSubmissions(seed.teacher, { groupId: seed.group.id }),
      await service.reviewQueue(seed.teacher, { kind: "GROUP", groupId: seed.group.id }),
    ];
    expect(JSON.stringify(views)).not.toContain(seed.firstChild.nickname);
    expect(views[0]).toMatchObject({ members: [{ displayName: "未披露昵称" }] });
    expect((views[0] as unknown as { members: unknown[] }).members[0]).not.toHaveProperty("grade");
  });

  it("hides residual teacher bindings after adult membership withdrawal", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    await seed.harness.repository.transaction(async (tx) => {
      for (const member of await tx.query("organizationMembers", {
        accountId: seed.teacher.accountId,
      }))
        await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
    });
    const service = new PresentationService(seed.harness);
    expect(await service.accountShell(seed.teacher)).toMatchObject({
      groups: [],
      organizations: [],
    });
    expect(await service.teacherDashboard(seed.teacher, { date: "2026-09-05" })).toMatchObject({
      groups: [],
      metrics: { dueToday: 0 },
    });
  });

  it.each([false, true])(
    "reauthorizes draft edits with legacy receipt=%s without repeating provider IO",
    async (legacy) => {
      const seed = await createIdentityScenario(1);
      const storage = new FakeVerifiedMediaStorage();
      const provider = new FakeOcrProvider({
        confidence: 1,
        provider: "fake",
        providerVersion: "1",
        title: "原草稿",
      });
      const media = new MediaService(seed.harness, storage, provider);
      const upload = await media.createUploadIntent(seed.teacher, {
        purpose: "TASK_SOURCE",
        ownerScope: { kind: "ORGANIZATION", organizationId: seed.organization.id },
        mimeType: "image/jpeg",
        byteSize: 4,
        retentionDays: 90,
        requestId: "receipt-draft-upload-intent",
      });
      await media.uploadContent(seed.teacher, {
        assetId: upload.asset.id,
        base64: Buffer.from([255, 216, 255, 0]).toString("base64"),
        requestId: "receipt-draft-upload-content",
      });
      const draft = await media.recognizeTaskDraft(seed.teacher, {
        assetId: upload.asset.id,
        requestId: "receipt-draft-recognition",
      });
      const api = createCoreApi({
        ...seed.harness,
        mediaStorage: storage,
        taskDraftProvider: provider,
      });
      const command = {
        action: "EDIT_TASK_DRAFT",
        payload: { draftId: draft.id, title: "授权后的草稿" },
        requestId: "receipt-draft-edit-retry",
      };
      const auth = { openId: "wx-scenario-teacher" };
      const first = await api.handle(command, auth);
      expect(first.ok).toBe(true);
      expect(await api.handle(command, auth)).toEqual(first);
      await seed.harness.repository.transaction(async (tx) => {
        if (legacy) {
          command.requestId = "historic-draft-edit-retry";
          await tx.insert("commandReceipts", {
            id: "historic-draft-receipt",
            accountId: seed.teacher.accountId,
            action: command.action,
            requestId: command.requestId,
            result: { secret: "stale receipt secret" },
            createdAt: seed.harness.clock.now(),
          });
        }
        for (const member of await tx.query("organizationMembers", {
          accountId: seed.teacher.accountId,
        }))
          await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
      });
      expect(await api.handle(command, auth)).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(provider.calls).toHaveLength(1);
    },
  );

  it("does not borrow disclosure from another group for a group-only teacher", async () => {
    const seed = await createSubmittedTaskScenario("ORGANIZATION");
    const secondGroup = await seed.identity.createGroup(seed.teacher, {
      organizationId: seed.organization.id,
      type: "LEARNING_GROUP",
      name: "不披露分组",
      requestId: "disclosure-second-group",
    });
    const invitation = await seed.invitations.createGroupInvitation(seed.teacher, {
      groupId: secondGroup.id,
      maxClaims: 1,
      expiresAt: "2026-09-06T10:00:00.000Z",
      requestId: "disclosure-second-invite",
    });
    const join = await seed.invitations.claimInvitation(seed.guardian, {
      childId: seed.firstChild.id,
      code: invitation.code,
      disclosure: { displayName: false, grade: false, avatar: false },
      requestId: "disclosure-second-claim",
    });
    const membership = await seed.invitations.approveJoinRequest(seed.teacher, {
      joinRequestId: join.id,
      requestId: "disclosure-second-approve",
    });
    const account = await seed.identity.createAccount({
      openId: "wx-group2-only",
      requestId: "disclosure-second-teacher",
    });
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: account.id,
      groupId: secondGroup.id,
      role: "TEACHER",
      requestId: "disclosure-second-binding",
    });
    const task = await seed.tasks.publishGroupTask(seed.teacher, {
      ...seed.task,
      groupId: secondGroup.id,
      occurrenceDate: "2026-09-05",
      requestId: "disclosure-second-task",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    if (!assignment) throw new Error("Missing assignment");
    await seed.submissions.submit(seed.childActor, {
      assignmentId: assignment.id,
      mediaAssetIds: [],
      requestId: "disclosure-second-submit",
    });
    const api = createCoreApi(seed.harness);
    for (const [action, payload] of [
      ["GET_GROUP_WORKSPACE", { groupId: secondGroup.id }],
      ["GET_GROUP_SUBMISSIONS", { groupId: secondGroup.id }],
      ["GET_REVIEW_QUEUE", { kind: "GROUP", groupId: secondGroup.id }],
      ["GET_ASSIGNMENT_DETAIL", { assignmentId: assignment.id }],
      ["GET_ORGANIZATION_CHILD", { organizationMemberId: membership.organizationMemberId }],
    ] as const) {
      const result = await api.handle({ action, payload }, { openId: "wx-group2-only" });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(seed.firstChild.nickname);
      expect(JSON.stringify(result)).not.toContain('"grade":3');
    }
  });

  it("preserves the actor's second active organization and group", async () => {
    const seed = await createIdentityScenario(1);
    const second = await seed.identity.createOrganization(seed.platform, {
      adminAccountId: seed.teacher.accountId,
      name: "有效工作空间",
      type: "SCHOOL",
      requestId: "active-second-organization",
    });
    const group = await seed.identity.createGroup(seed.teacher, {
      organizationId: second.id,
      name: "有效分组",
      type: "SCHOOL_CLASS",
      requestId: "active-second-group",
    });
    await seed.harness.repository.transaction(async (tx) => {
      for (const member of await tx.query("organizationMembers", {
        accountId: seed.teacher.accountId,
        organizationId: seed.organization.id,
      }))
        await tx.update("organizationMembers", member.id, { status: "WITHDRAWN" });
    });
    const service = new PresentationService(seed.harness);
    const shell = await service.accountShell(seed.teacher);
    expect(shell.groups.map((item) => item.id)).toEqual([group.id]);
    expect(shell.organizations.map((item) => item.id)).toEqual([second.id]);
    expect(
      (await service.teacherDashboard(seed.teacher, { date: "2026-09-05" })).groups.map(
        (item) => item.id,
      ),
    ).toEqual([group.id]);
  });

  it("does not repeat a legacy mutation when no authorization proof can be recovered", async () => {
    const seed = await createIdentityScenario(1);
    const command = {
      action: "CREATE_FAMILY",
      payload: { name: seed.family.name },
      requestId: "legacy-family-create-001",
    };
    await seed.harness.repository.transaction((tx) =>
      tx.insert("commandReceipts", {
        id: "legacy-family-create",
        accountId: seed.guardian.accountId,
        action: command.action,
        requestId: command.requestId,
        result: seed.family,
        createdAt: seed.harness.clock.now(),
      }),
    );
    expect(
      await createCoreApi(seed.harness).handle(command, { openId: "wx-scenario-guardian" }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await seed.harness.repository.query("families")).toHaveLength(1);
  });
});
