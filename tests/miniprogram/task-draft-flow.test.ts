import { readFileSync } from "node:fs";
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
  editStartsDate(this: MiniPageInstance, event: { detail: { value: string } }): void;
  editStartsTime(this: MiniPageInstance, event: { detail: { value: string } }): void;
  recognizePhoto(this: MiniPageInstance): Promise<void>;
  publish(this: MiniPageInstance): Promise<void>;
};
type MiniPageInstance = Definition & {
  data: Record<string, unknown>;
  setData(value: Record<string, unknown>): void;
};

afterEach(() => {
  vi.resetAllMocks();
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
    navigateBack: vi.fn(),
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
    startsDate: "2026-09-19",
    startsTime: "08:00",
  });
  expect(bridge.coreExecute.mock.calls.map(([action]) => action)).toEqual([
    "CREATE_UPLOAD_INTENT",
    "UPLOAD_MEDIA_CONTENT",
    "RECOGNIZE_TASK_DRAFT",
  ]);
  expect(bridge.coreExecute).not.toHaveBeenCalledWith("PUBLISH_TASK_DRAFT", expect.anything());
});

it.each(["parent", "teacher"])(
  "%s exposes every submission radio and publishes the selected value",
  async (role) => {
    const markup = readFileSync(
      new URL(`../../miniprogram/pages/${role}/task-editor/index.wxml`, import.meta.url),
      "utf8",
    );
    const radios = [...markup.matchAll(/<radio\s+value="([^"]+)"\s+checked="\{\{([^}]+)\}\}"/g)];
    expect(radios.map((match) => match[1])).toEqual(["CONFIRM", "TEXT", "PHOTO", "TEXT_AND_PHOTO"]);
    const handler = markup.match(/<radio-group\s+bindchange="([^"]+)"/)?.[1];
    const page = await loadPage(`../../miniprogram/pages/${role}/task-editor/index.js`);
    bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
    bridge.selectedChild.mockResolvedValue("child-own");
    bridge.selectedTeacherGroup.mockResolvedValue({ id: "group-own" });
    bridge.coreExecute.mockResolvedValue({ ok: true, data: {} });
    bridge.command.mockResolvedValue({});
    page.setData({ title: "可编辑任务" });
    for (const mode of ["CONFIRM", "TEXT", "PHOTO", "TEXT_AND_PHOTO"]) {
      const select = page[handler as "editSubmissionMode"];
      select.call(page, { detail: { value: mode } });
      expect(page.data.submissionMode).toBe(mode);
      for (const radio of radios) {
        const checked = new Function("submissionMode", `return ${radio[2]}`)(
          page.data.submissionMode,
        );
        expect(checked).toBe(radio[1] === mode);
      }
      await page.publish();
      const calls = role === "parent" ? bridge.coreExecute.mock.calls : bridge.command.mock.calls;
      expect(calls.at(-1)?.[1]).toMatchObject({ submissionMode: mode });
    }
  },
);

it.each(["parent", "teacher"])(
  "%s allows editing the AI start instant before publication",
  async (role) => {
    const page = await loadPage(`../../miniprogram/pages/${role}/task-editor/index.js`);
    bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
    bridge.selectedChild.mockResolvedValue("child-own");
    bridge.selectedTeacherGroup.mockResolvedValue({ id: "group-own" });
    bridge.coreExecute.mockResolvedValue({ ok: true, data: {} });
    bridge.command.mockResolvedValue({});
    page.setData({ title: "确认后的任务", draftId: "draft-own" });
    page.editStartsDate({ detail: { value: "2026-09-18" } });
    page.editStartsTime({ detail: { value: "09:30" } });
    await page.publish();
    const calls = role === "parent" ? bridge.coreExecute.mock.calls : bridge.command.mock.calls;
    expect(calls[0]?.[1]).toMatchObject({ startsAt: "2026-09-18T01:30:00.000Z" });
  },
);

function delayed<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each(["parent", "teacher"])(
  "%s blocks publication while delayed recognition is pending",
  async (role) => {
    const pending = delayed<Record<string, unknown>>();
    const actions: string[] = [];
    bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
    bridge.selectedChild.mockResolvedValue("child-own");
    bridge.selectedTeacherGroup.mockResolvedValue({ id: "group-own", organizationId: "org-own" });
    const execute = async (action: string) => {
      actions.push(action);
      if (action === "CREATE_UPLOAD_INTENT") return { asset: { id: "source-own" } };
      if (action === "UPLOAD_MEDIA_CONTENT") return { id: "source-own", status: "ACTIVE" };
      if (action === "RECOGNIZE_TASK_DRAFT") return pending.promise;
      return {};
    };
    bridge.command.mockImplementation(execute);
    bridge.coreExecute.mockImplementation(async (action: string) => ({
      ok: true,
      data: await execute(action),
    }));
    const page = await loadPage(`../../miniprogram/pages/${role}/task-editor/index.js`);
    page.setData({ title: "人工确认标题" });
    const recognizing = page.recognizePhoto();
    await vi.waitFor(() => expect(actions).toContain("RECOGNIZE_TASK_DRAFT"));
    const publishing = page.publish();
    pending.resolve({ id: "recognized-draft", title: "识别标题" });
    await Promise.all([recognizing, publishing]);
    expect(actions.filter((action) => action.startsWith("PUBLISH"))).toEqual([]);
    await page.publish();
    expect(actions.filter((action) => action.startsWith("PUBLISH"))).toEqual([
      "PUBLISH_TASK_DRAFT",
    ]);
  },
);

it.each(["parent", "teacher"])(
  "%s freezes the publication branch and fields before awaits",
  async (role) => {
    const pending = delayed<Record<string, unknown>>();
    const actions: { action: string; payload: Record<string, unknown> }[] = [];
    bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
    bridge.selectedChild.mockResolvedValue("child-own");
    bridge.selectedTeacherGroup.mockResolvedValue({ id: "group-own", organizationId: "org-own" });
    const execute = async (action: string, payload: Record<string, unknown>) => {
      actions.push({ action, payload });
      if (action === "EDIT_TASK_DRAFT") return pending.promise;
      return {};
    };
    bridge.command.mockImplementation(execute);
    bridge.coreExecute.mockImplementation(
      async (action: string, payload: Record<string, unknown>) => ({
        ok: true,
        data: await execute(action, payload),
      }),
    );
    const page = await loadPage(`../../miniprogram/pages/${role}/task-editor/index.js`);
    page.setData({ title: "已确认标题", draftId: "draft-own", sourceAssetIds: ["source-own"] });
    const publishing = page.publish();
    page.setData({ title: "后续编辑", sourceAssetIds: ["source-later"] });
    await vi.waitFor(() => expect(actions[0]?.action).toBe("EDIT_TASK_DRAFT"));
    await Promise.all([page.publish(), page.recognizePhoto()]);
    page.setData({ draftId: "draft-later" });
    pending.resolve({});
    await publishing;
    expect(actions.map(({ action }) => action)).toEqual(["EDIT_TASK_DRAFT", "PUBLISH_TASK_DRAFT"]);
    expect(actions[0]?.payload).toMatchObject({ title: "已确认标题", draftId: "draft-own" });
    expect(actions[1]?.payload).toMatchObject({
      draftId: "draft-own",
      sourceAssetIds: ["source-own"],
    });
    expect(page.data[role === "parent" ? "publishing" : "working"]).toBe(false);
  },
);

it.each(["parent", "teacher"])(
  "%s releases the publication lock after an API exception",
  async (role) => {
    bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
    bridge.selectedChild.mockResolvedValue("child-own");
    bridge.selectedTeacherGroup.mockResolvedValue({ id: "group-own" });
    bridge.coreExecute
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, data: {} });
    bridge.command.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    const page = await loadPage(`../../miniprogram/pages/${role}/task-editor/index.js`);
    page.setData({ title: "任务" });
    await page.publish();
    expect(page.data[role === "parent" ? "publishing" : "working"]).toBe(false);
    await page.publish();
    const calls = role === "parent" ? bridge.coreExecute.mock.calls : bridge.command.mock.calls;
    expect(calls.map(([action]) => action)).toEqual(
      role === "parent"
        ? ["PUBLISH_FAMILY_TASK", "PUBLISH_FAMILY_TASK"]
        : ["PUBLISH_GROUP_TASK", "PUBLISH_GROUP_TASK"],
    );
  },
);

it("keeps a manual parent publication on its original branch when mutable page data changes", async () => {
  const pending = delayed<Record<string, unknown>>();
  bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
  bridge.selectedChild.mockResolvedValue("child-own");
  bridge.coreExecute.mockImplementation(async (action: string) => ({
    ok: true,
    data: action === "PUBLISH_FAMILY_TASK" ? await pending.promise : {},
  }));
  const page = await loadPage("../../miniprogram/pages/parent/task-editor/index.js");
  page.setData({ title: "确认任务" });
  const publishing = page.publish();
  await vi.waitFor(() => expect(bridge.coreExecute.mock.calls[0]?.[0]).toBe("PUBLISH_FAMILY_TASK"));
  page.setData({ draftId: "late-draft" });
  pending.resolve({});
  await publishing;
  expect(bridge.coreExecute.mock.calls.map(([action]) => action)).toEqual(["PUBLISH_FAMILY_TASK"]);
});

it("preserves the visible parent category when AI has no category suggestion", async () => {
  bridge.selectedFamily.mockResolvedValue({ id: "family-own" });
  bridge.coreExecute.mockImplementation(async (action: string) => ({
    ok: true,
    data:
      action === "CREATE_UPLOAD_INTENT"
        ? { asset: { id: "source-own" } }
        : action === "UPLOAD_MEDIA_CONTENT"
          ? { id: "source-own", status: "ACTIVE" }
          : { id: "draft-own", title: "AI建议" },
  }));
  const page = await loadPage("../../miniprogram/pages/parent/task-editor/index.js");
  page.editCategory({ detail: { value: "3" } });
  await page.recognizePhoto();
  expect(page.data).toMatchObject({ category: "ENGLISH", categoryIndex: 3 });
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
