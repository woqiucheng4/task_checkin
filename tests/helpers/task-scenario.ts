import { SubmissionService } from "../../src/application/submission-service.js";
import { TaskService } from "../../src/application/task-service.js";
import type { ActorContext, SubmissionMode } from "../../src/domain/model.js";
import { createIdentityScenario } from "./identity-scenario.js";

export async function createSubmittedTaskScenario(
  source: "FAMILY" | "ORGANIZATION" = "FAMILY",
  submissionMode: SubmissionMode = "CONFIRM",
) {
  const seed = await createIdentityScenario(1);
  seed.harness.clock.set("2026-09-05T09:00:00.000Z");
  const tasks = new TaskService(seed.harness);
  const submissions = new SubmissionService(seed.harness);
  const common = {
    allowLateSubmission: true,
    category: "LIFE" as const,
    dueAt: "2026-09-05T13:00:00.000Z",
    estimatedMinutes: 10,
    importance: "REQUIRED" as const,
    occurrenceDate: "2026-09-05",
    schedule: { kind: "ONCE" as const, date: "2026-09-05" },
    startsAt: "2026-09-05T08:00:00.000Z",
    submissionMode,
    title: "整理书桌",
  };
  const task =
    source === "FAMILY"
      ? await tasks.publishFamilyTask(seed.guardian, {
          ...common,
          childIds: [seed.firstChild.id],
          familyId: seed.family.id,
          requestId: "task-scenario-family",
          requiresAcademicReview: false,
        })
      : await tasks.publishGroupTask(seed.teacher, {
          ...common,
          groupId: seed.group.id,
          requestId: "task-scenario-organization",
          requiresAcademicReview: true,
        });
  const assignment = (
    await seed.harness.repository.query("taskAssignments", { taskId: task.id })
  )[0];
  if (assignment === undefined) {
    throw new Error("task scenario assignment missing");
  }
  const childActor: ActorContext = {
    accountId: seed.guardian.accountId,
    childId: seed.firstChild.id,
    mode: "CHILD",
  };
  await submissions.submit(childActor, {
    assignmentId: assignment.id,
    mediaAssetIds: [],
    requestId: "task-scenario-submit",
    ...(submissionMode === "TEXT" || submissionMode === "TEXT_AND_PHOTO"
      ? { text: "已经完成" }
      : {}),
  });
  return { ...seed, assignment, childActor, submissions, task, tasks };
}
