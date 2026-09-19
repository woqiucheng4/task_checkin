import { afterEach, expect, it, vi } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { PresentationService } from "../../src/application/presentation-service.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

const bridge = vi.hoisted(() => ({ command: vi.fn(), showError: vi.fn() }));
vi.mock("../../miniprogram/services/session-runtime.js", () => bridge);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("normalizes legacy review=false through publication, submission, teacher queue, detail action, and one reward", async () => {
  const seed = await createSubmittedTaskScenario("ORGANIZATION");
  const task = await seed.tasks.publishGroupTask(seed.teacher, {
    ...seed.task,
    groupId: seed.group.id,
    requiresAcademicReview: false,
    occurrenceDate: "2026-09-05",
    requestId: "legacy-no-review-publish",
    title: "必须老师审核",
  });
  expect(task.requiresAcademicReview).toBe(true);
  const assignment = (
    await seed.harness.repository.query("taskAssignments", { taskId: task.id })
  )[0];
  if (!assignment) throw new Error("Published assignment missing");
  await seed.submissions.submit(seed.childActor, {
    assignmentId: assignment.id,
    mediaAssetIds: [],
    requestId: "mandatory-review-submit",
  });
  const presentation = new PresentationService(seed.harness);
  expect(
    (await presentation.reviewQueue(seed.teacher, { groupId: seed.group.id, kind: "GROUP" })).items,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ assignmentId: assignment.id, academicState: "PENDING" }),
    ]),
  );
  const api = createCoreApi(seed.harness);
  let requestCount = 0;
  bridge.command.mockImplementation(async (action: string, payload: Record<string, unknown>) => {
    const result = await api.handle(
      { action, payload, requestId: `mandatory-ui-command-${++requestCount}` },
      { openId: "wx-scenario-teacher" },
    );
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  });
  bridge.showError.mockImplementation((error) => {
    throw error;
  });
  type Definition = {
    data: Record<string, unknown>;
    onLoad(this: MiniPageInstance, query: { id: string }): Promise<void>;
    approve(this: MiniPageInstance): Promise<void>;
  };
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn(), navigateBack: vi.fn() });
  await import("../../miniprogram/pages/teacher/review-detail/index.js");
  if (!definition) throw new Error("Page not registered");
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
  await page.onLoad({ id: assignment.id });
  expect(page.data.canReview).toBe(true);
  await page.approve();
  await page.approve();
  expect(await seed.harness.repository.read("taskAssignments", assignment.id)).toMatchObject({
    taskState: "COMPLETED",
    academicState: "APPROVED",
    rewardState: "GRANTED",
  });
  expect(
    await seed.harness.repository.query("sunlightLedgers", { referenceId: assignment.id }),
  ).toHaveLength(1);
  expect(
    (
      await presentation.reviewQueue(seed.teacher, { groupId: seed.group.id, kind: "GROUP" })
    ).items.map((item) => item.assignmentId),
  ).not.toContain(assignment.id);
});
