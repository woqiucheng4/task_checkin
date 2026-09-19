import { describe, expect, it } from "vitest";
import { CommercialService } from "../../src/application/commercial-service.js";
import { PresentationService } from "../../src/application/presentation-service.js";
import { SubmissionService } from "../../src/application/submission-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const taskInput = {
  allowLateSubmission: true,
  category: "LANGUAGE" as const,
  description: "认真朗读并记录最喜欢的一句话",
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 15,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  schedule: { date: "2026-09-05", kind: "ONCE" as const },
  startsAt: "2026-09-05T08:00:00.000Z",
  submissionMode: "CONFIRM" as const,
};

describe("presentation optional and guard branches", () => {
  it("projects an active named tree and optional task fields for a parent", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    const task = await tasks.publishFamilyTask(seed.guardian, {
      ...taskInput,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "presentation-optional-family-task",
      requiresAcademicReview: false,
      title: "朗读秋天的雨",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    expect(assignment).toBeDefined();
    await seed.harness.repository.transaction(async (transaction) => {
      await transaction.update("taskAssignments", assignment?.id ?? "missing", {
        familyFocusRank: 1,
      });
      await transaction.insert("treeCatalog", {
        createdAt: seed.harness.clock.now(),
        fruitName: "苹果",
        id: "presentation-apple-catalog",
        name: "新手苹果树",
        rarity: "STARTER",
        stages: [{ minimumRatio: 0, name: "发芽" }],
        status: "ACTIVE",
        threshold: 30,
        updatedAt: seed.harness.clock.now(),
      });
      await transaction.insert("childTrees", {
        carryOver: 0,
        catalogId: "presentation-apple-catalog",
        childId: seed.firstChild.id,
        createdAt: seed.harness.clock.now(),
        id: "presentation-child-tree",
        name: "小秋",
        progress: 18,
        stage: "发芽",
        status: "GROWING",
        updatedAt: seed.harness.clock.now(),
      });
    });
    const presentation = new PresentationService(seed.harness);

    const dashboard = await presentation.parentDashboard(seed.guardian, {
      childId: seed.firstChild.id,
      date: "2026-09-05",
    });
    const taskCenter = await presentation.parentTaskCenter(seed.guardian, {
      childId: seed.firstChild.id,
    });

    expect(dashboard.currentTree).toMatchObject({ name: "小秋", progress: 18, threshold: 30 });
    expect(dashboard.today.items[0]).toMatchObject({
      description: taskInput.description,
      familyFocusRank: 1,
    });
    expect(taskCenter.items).toHaveLength(1);
  });

  it("projects group task progress and an active co-growing tree", async () => {
    const seed = await createIdentityScenario(1);
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: seed.teacher.accountId,
      groupId: seed.group.id,
      requestId: "presentation-branches-teacher-role",
      role: "TEACHER",
    });
    const tasks = new TaskService(seed.harness);
    const task = await tasks.publishGroupTask(seed.teacher, {
      ...taskInput,
      groupId: seed.group.id,
      requestId: "presentation-branches-group-task",
      requiresAcademicReview: true,
      title: "班级朗读",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    expect(assignment).toBeDefined();
    const submissions = new SubmissionService(seed.harness);
    await submissions.submit(
      {
        accountId: seed.guardian.accountId,

        mode: "ACCOUNT",
      },
      {
        childId: seed.firstChild.id,
        assignmentId: assignment?.id ?? "missing",
        mediaAssetIds: [],
        requestId: "presentation-branches-group-submit",
      },
    );
    await seed.harness.repository.transaction(async (transaction) => {
      await transaction.insert("groupTrees", {
        catalogId: "presentation-group-catalog",
        createdAt: seed.harness.clock.now(),
        groupId: seed.group.id,
        id: "presentation-group-tree",
        organizationId: seed.organization.id,
        progress: 12,
        stage: "幼苗",
        status: "GROWING",
        threshold: 80,
        updatedAt: seed.harness.clock.now(),
      });
    });
    const presentation = new PresentationService(seed.harness);

    const dashboard = await presentation.teacherDashboard(seed.teacher, { date: "2026-09-05" });
    const workspace = await presentation.groupWorkspace(seed.teacher, { groupId: seed.group.id });

    expect(dashboard.metrics).toMatchObject({ dueToday: 1, pendingReview: 1 });
    expect(workspace.groupTree).toMatchObject({ progress: 12, threshold: 80 });
    expect(workspace.tasks).toEqual([
      expect.objectContaining({ assignmentCount: 1, title: "班级朗读" }),
    ]);
  });

  it("rejects invalid provider identities and omits an absent settlement reference", async () => {
    const seed = await createIdentityScenario(1);
    const commercial = new CommercialService(seed.harness);
    const presentation = new PresentationService(seed.harness);
    const providerAccount = await seed.identity.createAccount({
      openId: "wx-presentation-provider-branches",
      requestId: "presentation-provider-branches-account",
    });
    const provider = await commercial.registerContentProvider(seed.platform, {
      accountId: providerAccount.id,
      name: "知新内容",
      requestId: "presentation-provider-branches",
    });

    await expect(presentation.providerDashboard(seed.guardian)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      presentation.providerDashboard({ accountId: providerAccount.id, mode: "CONTENT_PROVIDER" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      presentation.providerDashboard({
        accountId: providerAccount.id,
        contentProviderId: "missing-provider",
        mode: "CONTENT_PROVIDER",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      presentation.providerDashboard({
        accountId: seed.guardian.accountId,
        contentProviderId: provider.id,
        mode: "CONTENT_PROVIDER",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      presentation.providerDashboard({
        accountId: providerAccount.id,
        contentProviderId: provider.id,
        mode: "CONTENT_PROVIDER",
      }),
    ).resolves.toMatchObject({ provider: { id: provider.id, name: "知新内容" } });
  });
});
