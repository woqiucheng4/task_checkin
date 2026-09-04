import { describe, expect, it } from "vitest";

import { SubmissionService } from "../../src/application/submission-service.js";
import { TaskService } from "../../src/application/task-service.js";
import { ViewModelService } from "../../src/application/view-models.js";
import type { ActorContext } from "../../src/domain/model.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const taskFields = {
  allowLateSubmission: true,
  category: "LANGUAGE" as const,
  dueAt: "2026-09-05T13:00:00.000Z",
  estimatedMinutes: 15,
  importance: "REQUIRED" as const,
  occurrenceDate: "2026-09-05",
  requiresAcademicReview: true,
  schedule: { kind: "ONCE" as const, date: "2026-09-05" },
  startsAt: "2026-09-05T09:00:00.000Z",
  submissionMode: "CONFIRM" as const,
  title: "朗读课文",
};

describe("child today projection", () => {
  it("automatically includes a due institution task without guardian action", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:30:00.000Z");
    const tasks = new TaskService(seed.harness);
    const task = await tasks.publishGroupTask(seed.teacher, {
      ...taskFields,
      groupId: seed.group.id,
      requestId: "today-group-publish",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    const childActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: seed.firstChild.id,
      mode: "CHILD",
    };

    const view = await new ViewModelService(seed.harness).childToday(childActor, "2026-09-05");

    expect(view.mustDo.map((item) => item.assignmentId)).toContain(assignment?.id);
  });

  it("excludes a required task published at 18:00 from same-day all-done", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T10:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    const task = await tasks.publishGroupTask(seed.teacher, {
      ...taskFields,
      groupId: seed.group.id,
      requestId: "today-late-publish",
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    const childActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: seed.firstChild.id,
      mode: "CHILD",
    };

    const view = await new ViewModelService(seed.harness).childToday(childActor, "2026-09-05");

    expect(view.completionRequiredAssignmentIds).not.toContain(assignment?.id);
    expect(view.lateNoticeAssignmentIds).toContain(assignment?.id);
    expect(view.allDone).toBe(true);
  });

  it("counts a submitted assignment as fulfilled while review is pending", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:30:00.000Z");
    const tasks = new TaskService(seed.harness);
    const submissions = new SubmissionService(seed.harness);
    const task = await tasks.publishFamilyTask(seed.guardian, {
      ...taskFields,
      childIds: [seed.firstChild.id],
      familyId: seed.family.id,
      requestId: "today-family-publish",
      requiresAcademicReview: false,
    });
    const assignment = (
      await seed.harness.repository.query("taskAssignments", { taskId: task.id })
    )[0];
    const childActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: seed.firstChild.id,
      mode: "CHILD",
    };
    await submissions.submit(childActor, {
      assignmentId: assignment?.id ?? "",
      mediaAssetIds: [],
      requestId: "today-submit-1",
    });

    const view = await new ViewModelService(seed.harness).childToday(childActor, "2026-09-05");

    expect(view.allDone).toBe(true);
    expect(view.mustDo).toMatchObject([{ taskState: "SUBMITTED", rewardState: "PROTECTED" }]);
  });

  it("lets a guardian emphasize one to three assignments in order", async () => {
    const seed = await createIdentityScenario(1);
    seed.harness.clock.set("2026-09-05T09:00:00.000Z");
    const tasks = new TaskService(seed.harness);
    const taskIds = [];
    for (let index = 0; index < 2; index += 1) {
      const task = await tasks.publishFamilyTask(seed.guardian, {
        ...taskFields,
        childIds: [seed.firstChild.id],
        familyId: seed.family.id,
        requestId: `today-focus-publish-${index}`,
        requiresAcademicReview: false,
        title: `家庭任务${index + 1}`,
      });
      const assignment = (
        await seed.harness.repository.query("taskAssignments", { taskId: task.id })
      )[0];
      taskIds.push(assignment?.id ?? "");
    }

    await tasks.setFamilyFocus(seed.guardian, {
      assignmentIds: taskIds.reverse(),
      childId: seed.firstChild.id,
      date: "2026-09-05",
      requestId: "today-focus-set",
    });
    const childActor: ActorContext = {
      accountId: seed.guardian.accountId,
      childId: seed.firstChild.id,
      mode: "CHILD",
    };
    const view = await new ViewModelService(seed.harness).childToday(childActor, "2026-09-05");

    expect(view.familyFocus.map((item) => item.assignmentId)).toEqual(taskIds);
  });
});
