import { afterEach, expect, it, vi } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { createSubmittedTaskScenario } from "../helpers/task-scenario.js";

const bridge = vi.hoisted(() => ({
  command: vi.fn(),
  selectedTeacherGroup: vi.fn(),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => ({
  command: bridge.command,
  today: () => "2026-09-07",
  showError: (error: unknown) => {
    throw error;
  },
}));
vi.mock("../../miniprogram/services/teacher-runtime.js", () => ({
  selectedTeacherGroup: bridge.selectedTeacherGroup,
}));
afterEach(() => vi.unstubAllGlobals());

it("reuses an authorized template and publishes selected fields through the real Core API", async () => {
  const seed = await createSubmittedTaskScenario("ORGANIZATION");
  const template = await seed.tasks.createTemplate(seed.teacher, {
    ...seed.task,
    organizationId: seed.organization.id,
    occurrenceDate: "2026-09-05",
    requestId: "template-ui-create-0001",
    title: "观察植物",
    description: "记录今天的变化",
    category: "SCIENCE",
    estimatedMinutes: 25,
    importance: "CHALLENGE",
    submissionMode: "TEXT_AND_PHOTO",
    allowLateSubmission: false,
    requiresAcademicReview: false,
  });
  const api = createCoreApi(seed.harness);
  let requestCount = 0;
  bridge.selectedTeacherGroup.mockResolvedValue({ id: seed.group.id, name: seed.group.name });
  bridge.command.mockImplementation(async (action: string, payload: Record<string, unknown>) => {
    const result = await api.handle(
      { action, payload, requestId: `template-ui-command-${++requestCount}` },
      { openId: "wx-scenario-teacher" },
    );
    if (!result.ok) throw new Error(result.error.message);
    return result.data;
  });
  type Definition = {
    data: Record<string, unknown>;
    onLoad(this: MiniPageInstance): Promise<void>;
    chooseMode(
      this: MiniPageInstance,
      event: { currentTarget: { dataset: { mode: string } } },
    ): Promise<void>;
    useTemplate(
      this: MiniPageInstance,
      event: { currentTarget: { dataset: { id: string } } },
    ): void;
    editCategory(this: MiniPageInstance, event: { detail: { value: string } }): void;
    publish(this: MiniPageInstance): Promise<void>;
  };
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn(), navigateBack: vi.fn() });
  await import("../../miniprogram/pages/teacher/task-editor/index.js");
  if (!definition) throw new Error("Page not registered");
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
  await page.onLoad();
  await page.chooseMode({ currentTarget: { dataset: { mode: "TEMPLATE" } } });
  expect(page.data.templates).toMatchObject([{ id: template.id, title: "观察植物" }]);
  page.useTemplate({ currentTarget: { dataset: { id: template.id } } });
  expect(page.data).toMatchObject({
    title: "观察植物",
    description: "记录今天的变化",
    category: "SCIENCE",
    estimatedMinutes: 25,
    importance: "CHALLENGE",
    submissionMode: "TEXT_AND_PHOTO",
    allowLateSubmission: false,
    requireReview: false,
    date: "2026-09-07",
  });
  page.editCategory({ detail: { value: "3" } });
  await page.publish();
  const tasks = await seed.harness.repository.query("tasks", { title: "观察植物" });
  expect(tasks).toMatchObject([
    {
      groupId: seed.group.id,
      category: "ENGLISH",
      estimatedMinutes: 25,
      importance: "CHALLENGE",
      submissionMode: "TEXT_AND_PHOTO",
      allowLateSubmission: false,
      requiresAcademicReview: false,
      schedule: { kind: "ONCE", date: "2026-09-07" },
      dueAt: "2026-09-07T15:59:00.000Z",
    },
  ]);
  const published = tasks[0];
  if (!published) throw new Error("Published task missing");
  expect(
    await seed.harness.repository.query("taskAssignments", { taskId: published.id }),
  ).toHaveLength(1);
});
