import { describe, expect, it } from "vitest";

import { TaskService } from "../../src/application/task-service.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const baseTask = {
  allowLateSubmission: true,
  category: "MATHEMATICS" as const,
  description: "完成练习册第 12 页",
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 20,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  reminderAt: "2026-09-05T11:00:00.000Z",
  requiresAcademicReview: true,
  schedule: { kind: "ONCE" as const, date: "2026-09-05" },
  startsAt: "2026-09-05T10:00:00.000Z",
  submissionMode: "CONFIRM" as const,
  title: "数学练习",
};

describe("task publication", () => {
  it("publishes one independent assignment per active group child", async () => {
    const seed = await createIdentityScenario(2);
    const tasks = new TaskService(seed.harness);

    const task = await tasks.publishGroupTask(seed.teacher, {
      ...baseTask,
      groupId: seed.group.id,
      requestId: "publish-group-1",
    });
    const assignments = await seed.harness.repository.query("taskAssignments", {
      taskId: task.id,
    });

    expect(assignments.map((item) => item.organizationMemberId).sort()).toEqual(
      seed.memberships.map((item) => item.organizationMemberId).sort(),
    );
    expect(new Set(assignments.map((item) => item.id)).size).toBe(2);

    await seed.harness.repository.transaction((tx) =>
      tx.update("taskAssignments", assignments[0]?.id ?? "", {
        taskState: "SUBMITTED",
        updatedAt: seed.harness.clock.now(),
      }),
    );
    expect(
      await seed.harness.repository.read("taskAssignments", assignments[1]?.id ?? ""),
    ).toMatchObject({ taskState: "PENDING" });
  });

  it("publishes a family task without institution identifiers", async () => {
    const seed = await createIdentityScenario(2);
    const tasks = new TaskService(seed.harness);

    const task = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      childIds: seed.children.map((child) => child.id),
      familyId: seed.family.id,
      requestId: "publish-family-1",
      requiresAcademicReview: false,
    });
    const assignments = await seed.harness.repository.query("taskAssignments", {
      taskId: task.id,
    });

    expect(assignments).toHaveLength(2);
    for (const assignment of assignments) {
      expect(assignment).not.toHaveProperty("organizationId");
      expect(assignment).not.toHaveProperty("organizationMemberId");
      expect(assignment.academicState).toBe("NOT_REQUIRED");
    }
  });

  it("creates and archives a reusable family template", async () => {
    const seed = await createIdentityScenario(1);
    const tasks = new TaskService(seed.harness);
    const template = await tasks.createTemplate(seed.guardian, {
      ...baseTask,
      familyId: seed.family.id,
      requestId: "template-create-1",
    });

    const archived = await tasks.archiveTemplate(seed.guardian, {
      requestId: "template-archive-1",
      templateId: template.id,
    });

    expect(archived.status).toBe("ARCHIVED");
  });

  it("cancels a published task and every unfinished assignment", async () => {
    const seed = await createIdentityScenario(1);
    const tasks = new TaskService(seed.harness);
    const task = await tasks.publishFamilyTask(seed.guardian, {
      ...baseTask,
      childIds: [seed.children[0]?.id ?? ""],
      familyId: seed.family.id,
      requestId: "publish-family-cancel",
      requiresAcademicReview: false,
    });

    const cancelled = await tasks.cancelTask(seed.guardian, {
      requestId: "cancel-family-task",
      taskId: task.id,
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(
      await seed.harness.repository.query("taskAssignments", { taskId: task.id }),
    ).toMatchObject([{ taskState: "CANCELLED" }]);
  });
});
