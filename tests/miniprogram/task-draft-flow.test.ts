import { afterEach, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  command: vi.fn(),
  coreExecute: vi.fn(),
  selectedChild: vi.fn(),
  selectedFamily: vi.fn(),
  selectedTeacherGroup: vi.fn(),
}));

vi.mock("../../miniprogram/services/session-runtime.js", () => ({
  command: bridge.command,
  selectedChild: bridge.selectedChild,
  selectedFamily: bridge.selectedFamily,
  showError: vi.fn(),
  today: () => "2026-09-19",
}));
vi.mock("../../miniprogram/services/page-runtime.js", () => ({
  coreApiClient: { execute: bridge.coreExecute },
}));
vi.mock("../../miniprogram/services/teacher-runtime.js", () => ({
  selectedTeacherGroup: bridge.selectedTeacherGroup,
}));

type Definition = {
  data: Record<string, unknown>;
  editCategory(this: MiniPageInstance, event: { detail: { value: string } }): void;
  editSubmissionMode(this: MiniPageInstance, event: { detail: { value: string } }): void;
  recognizePhoto(this: MiniPageInstance): Promise<void>;
  publish(this: MiniPageInstance): Promise<void>;
};
type MiniPageInstance = Definition & {
  data: Record<string, unknown>;
  setData(value: Record<string, unknown>): void;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadPage(path: string): Promise<MiniPageInstance> {
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", {
    chooseMedia: vi.fn().mockResolvedValue({ tempFiles: [{ tempFilePath: "/tmp/task.jpg" }] }),
    getFileSystemManager: () => ({ readFileSync: vi.fn().mockReturnValue("/9j/4AAB/9k=") }),
    showToast: vi.fn(),
  });
  await import(path);
  if (!definition) throw new Error("Page not registered");
  const registered = definition as Definition;
  const page: MiniPageInstance = {
    ...registered,
    data: { ...registered.data },
    setData(value) {
      Object.assign(page.data, value);
    },
  };
  return page;
}

it("parent image recognition creates an editable draft without publishing it", async () => {
  bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
  bridge.coreExecute.mockImplementation(async (action: string) => {
    if (action === "CREATE_UPLOAD_INTENT")
      return { ok: true, data: { asset: { id: "task-source-1" } } };
    if (action === "UPLOAD_MEDIA_CONTENT")
      return { ok: true, data: { id: "task-source-1", status: "ACTIVE" } };
    if (action === "RECOGNIZE_TASK_DRAFT") {
      return {
        ok: true,
        data: {
          id: "draft-1",
          title: "完成数学练习",
          description: "第 3 页",
          category: "MATHEMATICS",
          startsAt: "2026-09-19T00:00:00.000Z",
          dueAt: "2026-09-19T15:59:00.000Z",
          submissionMode: "PHOTO",
          confidence: 0.82,
        },
      };
    }
    throw new Error(`unexpected action ${action}`);
  });
  const page = await loadPage("../../miniprogram/pages/parent/task-editor/index.js");

  await page.recognizePhoto();

  expect(page.data).toMatchObject({
    draftId: "draft-1",
    title: "完成数学练习",
    category: "MATHEMATICS",
    submissionMode: "PHOTO",
    sourceAssetIds: ["task-source-1"],
    confidence: "识别置信度 82%，请逐项确认",
  });
  expect(bridge.coreExecute.mock.calls.map(([action]) => action)).toEqual([
    "CREATE_UPLOAD_INTENT",
    "UPLOAD_MEDIA_CONTENT",
    "RECOGNIZE_TASK_DRAFT",
  ]);
  expect(bridge.coreExecute).not.toHaveBeenCalledWith("PUBLISH_TASK_DRAFT", expect.anything());
});

it("teacher image recognition uses the selected group organization and keeps manual fallback", async () => {
  bridge.selectedTeacherGroup.mockResolvedValue({
    id: "group-own",
    organizationId: "organization-own",
    name: "一组",
  });
  bridge.command.mockImplementation(async (action: string) => {
    if (action === "CREATE_UPLOAD_INTENT") return { asset: { id: "task-source-2" } };
    if (action === "UPLOAD_MEDIA_CONTENT") return { id: "task-source-2", status: "ACTIVE" };
    if (action === "RECOGNIZE_TASK_DRAFT") throw new Error("图片暂时无法生成任务草稿，请手动填写");
    throw new Error(`unexpected action ${action}`);
  });
  const page = await loadPage("../../miniprogram/pages/teacher/task-editor/index.js");

  await page.recognizePhoto();

  expect(page.data).toMatchObject({ sourceAssetIds: ["task-source-2"], title: "", working: false });
  expect(bridge.command.mock.calls[0]).toEqual([
    "CREATE_UPLOAD_INTENT",
    expect.objectContaining({
      purpose: "TASK_SOURCE",
      retentionDays: 90,
      ownerScope: { kind: "ORGANIZATION", organizationId: "organization-own" },
    }),
  ]);
  expect(bridge.command).not.toHaveBeenCalledWith("PUBLISH_TASK_DRAFT", expect.anything());
});

it("publishes a reviewed parent draft only after saving its current editor fields", async () => {
  bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
  bridge.selectedChild.mockResolvedValue("child-own");
  bridge.coreExecute.mockResolvedValue({ ok: true, data: {} });
  const page = await loadPage("../../miniprogram/pages/parent/task-editor/index.js");
  Object.assign(page.data, {
    category: "MATHEMATICS",
    date: "2026-09-19",
    draftId: "draft-own",
    sourceAssetIds: ["task-source-1"],
    submissionMode: "PHOTO",
    time: "23:59",
    title: "已确认的题目",
  });

  page.editCategory({ detail: { value: "0" } });
  page.editSubmissionMode({ detail: { value: "PHOTO" } });
  await page.publish();

  expect(bridge.coreExecute.mock.calls.map(([action]) => action)).toEqual([
    "EDIT_TASK_DRAFT",
    "PUBLISH_TASK_DRAFT",
  ]);
  expect(bridge.coreExecute.mock.calls[1]?.[1]).toMatchObject({
    draftId: "draft-own",
    sourceAssetIds: ["task-source-1"],
    familyId: "family-own",
  });
  expect(bridge.coreExecute.mock.calls[0]?.[1]).toMatchObject({
    category: "LIFE",
    submissionMode: "PHOTO",
  });
});

it("does not start another image operation after retaining three sources", async () => {
  const page = await loadPage("../../miniprogram/pages/parent/task-editor/index.js");
  Object.assign(page.data, { sourceAssetIds: ["source-1", "source-2", "source-3"] });

  await page.recognizePhoto();

  expect(bridge.coreExecute).not.toHaveBeenCalled();
});
