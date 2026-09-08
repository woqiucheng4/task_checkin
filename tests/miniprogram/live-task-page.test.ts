import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  command: vi.fn(),
  selectedChild: vi.fn().mockResolvedValue("child-real"),
  showError: vi.fn(),
  today: () => "2026-09-07",
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
afterEach(() => vi.unstubAllGlobals());

it("renders server task data and filters the displayed rows instead of fixture tasks", async () => {
  type Definition = {
    data: Record<string, unknown> & { tasks: { assignmentId: string; title: string }[] };
    onShow(this: MiniPageInstance): Promise<void>;
    chooseFilter(
      this: MiniPageInstance,
      event: { currentTarget: { dataset: { filter: string } } },
    ): void;
  };
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  const task = {
    assignmentId: "real-assignment",
    taskId: "real-task",
    title: "真实家庭任务",
    source: "FAMILY",
    category: "LIFE",
    importance: "REQUIRED",
    submissionMode: "CONFIRM",
    startsAt: "2026-09-07T00:00:00Z",
    dueAt: "2026-09-07T15:00:00Z",
    taskState: "PENDING",
    academicState: "NOT_REQUIRED",
    rewardState: "NONE",
  };
  session.command.mockResolvedValue({
    child: { id: "child-real", nickname: "小新" },
    items: [task],
  });
  await import("../../miniprogram/pages/parent/tasks/index.js");
  if (!definition) throw new Error("Page was not registered");
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
  await page.onShow();
  expect(page.data.tasks).toHaveLength(1);
  expect(page.data.tasks[0]).toMatchObject({
    assignmentId: "real-assignment",
    title: "真实家庭任务",
  });
  await page.chooseFilter({ currentTarget: { dataset: { filter: "SCHOOL" } } });
  expect(page.data.tasks).toHaveLength(0);
  await page.chooseFilter({ currentTarget: { dataset: { filter: "ALL" } } });
  expect(page.data.tasks).toHaveLength(1);
});
