import { describe, expect, it } from "vitest";
import { CommercialService } from "../../src/application/commercial-service.js";
import { PresentationService } from "../../src/application/presentation-service.js";
import { SubmissionService } from "../../src/application/submission-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const taskInput = {
  allowLateSubmission: true,
  category: "LANGUAGE" as const,
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 15,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  schedule: { date: "2026-09-05", kind: "ONCE" as const },
  startsAt: "2026-09-05T08:00:00.000Z",
  submissionMode: "CONFIRM" as const,
};

describe("UI presentation projections", () => {
  it("builds an account shell for every active family and organization role", async () => {
    const seed = await createIdentityScenario(2);
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: seed.teacher.accountId,
      groupId: seed.group.id,
      requestId: "presentation-shell-teacher-role",
      role: "TEACHER",
    });
    const presentation = new PresentationService(seed.harness);

    const guardian = await presentation.accountShell(seed.guardian);
    const teacher = await presentation.accountShell(seed.teacher);

    expect(guardian.families).toEqual([
      expect.objectContaining({
        children: [
          expect.objectContaining({ nickname: "孩子1" }),
          expect.objectContaining({ nickname: "孩子2" }),
        ],
        id: seed.family.id,
        role: "FAMILY_ADMIN",
      }),
    ]);
    expect(teacher.organizations).toEqual([
      expect.objectContaining({ id: seed.organization.id, role: "ORGANIZATION_ADMIN" }),
    ]);
    expect(teacher.groups).toEqual([
      expect.objectContaining({ id: seed.group.id, role: "TEACHER" }),
    ]);
  });

  it("combines family and institution work in one authorized parent dashboard", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    await tasks.publishFamilyTask(seed.guardian, {
      ...taskInput,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "presentation-family-task",
      requiresAcademicReview: false,
      title: "整理书桌",
    });
    await tasks.publishGroupTask(seed.teacher, {
      ...taskInput,
      groupId: seed.group.id,
      requestId: "presentation-group-task",
      requiresAcademicReview: true,
      title: "朗读课文",
    });
    const presentation = new PresentationService(seed.harness);

    const view = await presentation.parentDashboard(seed.guardian, {
      childId: seed.firstChild.id,
      date: "2026-09-05",
    });

    expect(view.selectedChild).toMatchObject({ id: seed.firstChild.id, nickname: "孩子1" });
    expect(view.children).toEqual([
      expect.objectContaining({ id: seed.firstChild.id, selected: true }),
    ]);
    expect(view.today.items.map((item) => item.source)).toEqual(["FAMILY", "LEARNING_GROUP"]);
    expect(view.today).toMatchObject({ completedCount: 0, requiredCount: 2 });
  });

  it("builds family and teacher review queues from submitted assignments", async () => {
    const seed = await createIdentityScenario(1);
    await seed.identity.bindGroupRole(seed.teacher, {
      accountId: seed.teacher.accountId,
      groupId: seed.group.id,
      requestId: "presentation-review-teacher-role",
      role: "TEACHER",
    });
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    const submissions = new SubmissionService(seed.harness);
    const published = await tasks.publishGroupTask(seed.teacher, {
      ...taskInput,
      groupId: seed.group.id,
      requestId: "presentation-review-task",
      requiresAcademicReview: true,
      title: "班级朗读",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: published.id })
    )[0];
    expect(assignment).toBeDefined();
    await submissions.submit(
      {
        accountId: seed.guardian.accountId,
        childId: seed.firstChild.id,
        mode: "CHILD",
      },
      {
        assignmentId: assignment?.id ?? "missing",
        mediaAssetIds: [],
        requestId: "presentation-review-submit",
      },
    );
    const presentation = new PresentationService(seed.harness);

    const familyQueue = await presentation.reviewQueue(seed.guardian, {
      childId: seed.firstChild.id,
      kind: "FAMILY",
    });
    const teacherQueue = await presentation.reviewQueue(seed.teacher, {
      groupId: seed.group.id,
      kind: "GROUP",
    });

    expect(familyQueue.items).toEqual([
      expect.objectContaining({ assignmentId: assignment?.id, childLabel: "孩子1" }),
    ]);
    expect(teacherQueue.items).toEqual([
      expect.objectContaining({
        assignmentId: assignment?.id,
        organizationMemberId: seed.memberships[0]?.organizationMemberId,
      }),
    ]);
  });

  it("summarizes institution, platform, and provider workspaces without child content", async () => {
    const seed = await createIdentityScenario(1);
    const commercial = new CommercialService(seed.harness);
    const providerAccount = await seed.identity.createAccount({
      openId: "wx-presentation-provider",
      requestId: "presentation-provider-account",
    });
    const provider = await commercial.registerContentProvider(seed.platform, {
      accountId: providerAccount.id,
      name: "青苗内容",
      requestId: "presentation-provider",
      settlementAccountRef: "settlement-presentation",
    });
    await commercial.publishProviderTemplate(
      { accountId: providerAccount.id, contentProviderId: provider.id, mode: "CONTENT_PROVIDER" },
      {
        allowLateSubmission: true,
        category: "SCIENCE",
        estimatedMinutes: 10,
        importance: "CHALLENGE",
        requestId: "presentation-provider-template",
        requiresAcademicReview: false,
        schedule: { kind: "DAILY", startDate: "2026-09-05" },
        submissionMode: "CONFIRM",
        title: "观察一片叶子",
      },
    );
    const presentation = new PresentationService(seed.harness);

    const institution = await presentation.institutionDashboard(seed.teacher, {
      organizationId: seed.organization.id,
    });
    const platform = await presentation.platformDashboard(seed.platform);
    const providerView = await presentation.providerDashboard({
      accountId: providerAccount.id,
      contentProviderId: provider.id,
      mode: "CONTENT_PROVIDER",
    });

    expect(institution).toMatchObject({
      groups: [{ id: seed.group.id, memberCount: 1 }],
      organization: { id: seed.organization.id, name: "青禾老师", type: "TEACHER_WORKSPACE" },
    });
    expect(platform.metrics).toMatchObject({ activeOrganizations: 1, contentProviders: 1 });
    expect(providerView.templates).toEqual([expect.objectContaining({ title: "观察一片叶子" })]);
    expect(JSON.stringify({ institution, platform, providerView })).not.toMatch(
      /任务正文|愿望内容|storageKey/,
    );
  });
});
