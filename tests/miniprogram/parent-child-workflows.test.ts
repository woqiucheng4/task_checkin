import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  childId: "child-a",
  children: [
    { id: "child-a", nickname: "甲" },
    { id: "child-b", nickname: "乙" },
  ],
  failDashboard: false,
}));
const cloud = vi.hoisted(() => ({ execute: vi.fn() }));
const runtime = vi.hoisted(() => ({ navigate: vi.fn(), replace: vi.fn(), coreApiClient: cloud }));
const session = vi.hoisted(() => ({
  selectedChild: vi.fn(async () => state.childId),
  selectChild: vi.fn(async (id: string) => {
    state.childId = id;
  }),
  showError: vi.fn(),
  today: () => "2026-09-19",
  dashboard: vi.fn(async () => {
    if (state.failDashboard) throw new Error("网络不可用");
    return {
      children: state.children,
      accountShell: { families: [{ children: state.children }] },
      selectedChild: state.children.find((child) => child.id === state.childId) || {
        id: "",
        nickname: "",
      },
      selectionRequired: !state.childId,
      today: { items: [], pendingReviewCount: 0 },
      groups: [],
    };
  }),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => runtime);

type PageDefinition = {
  data: Record<string, unknown>;
  onLoad(
    this: MiniPageInstance,
    query: { id?: string; childId?: string; revision?: string },
  ): Promise<void>;
  onShow(this: MiniPageInstance): Promise<void>;
  openTask(this: MiniPageInstance, event: { detail: { assignmentId: string } }): void;
  selectChild(
    this: MiniPageInstance,
    event: { currentTarget: { dataset: { id: string } } },
  ): Promise<void>;
  openSubmit(this: MiniPageInstance): Promise<void>;
  openSelection(this: MiniPageInstance): void;
  createTask(this: MiniPageInstance): void;
  openGroups(this: MiniPageInstance): void;
  openOrchard(this: MiniPageInstance): void;
  choosePhoto(this: MiniPageInstance): Promise<void>;
  submit(this: MiniPageInstance): Promise<void>;
  harvest(this: MiniPageInstance): Promise<void>;
  approve(this: MiniPageInstance): Promise<void>;
  open(this: MiniPageInstance, event: { currentTarget: { dataset: { id: string } } }): void;
  startNext(
    this: MiniPageInstance,
    event: { currentTarget: { dataset: { catalogId: string } } },
  ): Promise<void>;
};
async function pageAt(name: string) {
  let definition: PageDefinition | undefined;
  vi.stubGlobal("Page", (value: PageDefinition) => {
    definition = value;
  });
  await import(`../../miniprogram/pages/parent/${name}/index.ts`);
  if (!definition) throw new Error("Missing page");
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
}
const task = (childId: string) => ({
  assignmentId: `assignment-${childId}`,
  title: childId,
  category: "LIFE",
  source: "FAMILY",
  importance: "REQUIRED",
  dueAt: "2026-09-19T12:00:00Z",
  taskState: "PENDING",
  academicState: "NOT_REQUIRED",
  rewardState: "NONE",
  submissionMode: "PHOTO",
  sourceAssetIds: ["source-private"],
});
let nextAsset = 0;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  nextAsset = 0;
  state.childId = "child-a";
  state.children = [
    { id: "child-a", nickname: "甲" },
    { id: "child-b", nickname: "乙" },
  ];
  state.failDashboard = false;
  vi.stubGlobal("wx", {
    showToast: vi.fn(),
    navigateBack: vi.fn(),
    redirectTo: vi.fn(),
    chooseMedia: vi.fn(async () => ({
      tempFiles: [
        { tempFilePath: "one.png" },
        { tempFilePath: "two.png" },
        { tempFilePath: "three.png" },
      ],
    })),
    getFileSystemManager: () => ({ readFileSync: () => "iVBORw0KGgo=" }),
  });
  cloud.execute.mockImplementation(async (action: string, payload: Record<string, string>) => {
    if (action === "GET_PARENT_TASK_CENTER")
      return {
        ok: true,
        data: { child: { id: payload.childId }, items: [task(payload.childId || "")] },
      };
    if (action === "GET_ASSIGNMENT_DETAIL") return { ok: true, data: task(payload.childId || "") };
    if (action === "READ_MEDIA_ASSET")
      return { ok: true, data: { downloadUrl: "https://private.invalid/signed-source" } };
    if (action === "CREATE_UPLOAD_INTENT")
      return { ok: true, data: { asset: { id: `asset-${++nextAsset}` } } };
    if (action === "UPLOAD_MEDIA_CONTENT")
      return { ok: true, data: { id: payload.assetId, status: "ACTIVE" } };
    if (action === "GET_CHILD_ORCHARD")
      return { ok: true, data: { lifetimeSunlight: 0, growthCards: [], fruits: [] } };
    if (action === "GET_REVIEW_QUEUE")
      return { ok: true, data: { items: [task(payload.childId || "")] } };
    return { ok: true, data: {} };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("parent-operated child workflows", () => {
  it.each(["home", "tasks", "orchard", "groups", "reviews"])(
    "%s offers a selection without a child-scoped request",
    async (name) => {
      state.childId = "";
      const page = await pageAt(name);
      await page.onShow();
      expect(page.data).toMatchObject({
        selectionRequired: true,
        children: state.children,
        loading: false,
      });
      expect(cloud.execute).not.toHaveBeenCalled();
      if (name === "home") {
        page.createTask();
        page.openOrchard();
        page.openGroups();
        expect(runtime.navigate.mock.calls).toEqual(Array(3).fill(["/pages/parent/home/index"]));
      }
    },
  );
  it("offers family creation when no children exist", async () => {
    state.childId = "";
    state.children = [];
    const page = await pageAt("home");
    await page.onShow();
    page.openSelection();
    expect(page.data.selectionAction).toBe("创建家庭并添加孩子");
    expect(runtime.navigate).toHaveBeenCalledWith("/pages/bootstrap/index");
    expect(cloud.execute).not.toHaveBeenCalled();
  });
  it("keeps guardian-linked children in other families available in the selector", async () => {
    session.dashboard.mockResolvedValueOnce({
      ...(await session.dashboard()),
      children: state.children.slice(0, 1),
    });
    const page = await pageAt("home");
    await page.onShow();
    expect(page.data.children).toEqual(state.children);
  });
  it("switches task rows and routes with the explicit child and assignment pair", async () => {
    const page = await pageAt("tasks");
    await page.onShow();
    await page.selectChild({ currentTarget: { dataset: { id: "child-b" } } });
    expect(page.data).toMatchObject({
      selectedChildId: "child-b",
      selectedName: "乙",
      tasks: [{ assignmentId: "assignment-child-b", action: { label: "为孩子查看任务" } }],
    });
    page.openTask({ detail: { assignmentId: "assignment-child-b" } });
    expect(runtime.navigate).toHaveBeenCalledWith(
      "/pages/parent/task-detail/index?id=assignment-child-b&childId=child-b",
    );
    expect(cloud.execute).toHaveBeenLastCalledWith(
      "GET_PARENT_TASK_CENTER",
      { childId: "child-b" },
      { mode: "ACCOUNT" },
    );
  });
  it("clears previous tasks when a new child's load fails", async () => {
    const page = await pageAt("tasks");
    await page.onShow();
    state.failDashboard = true;
    await page.selectChild({ currentTarget: { dataset: { id: "child-b" } } });
    expect(page.data).toMatchObject({
      tasks: [],
      allTasks: [],
      selectedChildId: "",
      selectionRequired: true,
    });
  });
  it("reads private task images with account child scope and opens parent submission", async () => {
    const page = await pageAt("task-detail");
    await page.onLoad({ id: "assignment-child-a", childId: "child-a" });
    expect(cloud.execute).toHaveBeenCalledWith(
      "GET_ASSIGNMENT_DETAIL",
      { assignmentId: "assignment-child-a", childId: "child-a" },
      { mode: "ACCOUNT" },
    );
    expect(cloud.execute).toHaveBeenCalledWith(
      "READ_MEDIA_ASSET",
      { assetId: "source-private", childId: "child-a" },
      { mode: "ACCOUNT" },
    );
    expect(page.data.images).toEqual(["https://private.invalid/signed-source"]);
    await page.openSubmit();
    expect(runtime.navigate).toHaveBeenCalledWith(
      "/pages/parent/task-submit/index?id=assignment-child-a&childId=child-a",
    );
  });
  it.each(["task-detail", "task-submit", "review-detail"])(
    "%s blocks stale child routes and provides recovery",
    async (name) => {
      state.childId = "child-b";
      const page = await pageAt(name);
      await page.onLoad({ id: "assignment-child-a", childId: "child-a" });
      expect(page.data).toMatchObject({
        ready: false,
        error: "孩子已切换，请返回首页重新选择任务",
      });
      expect(cloud.execute).not.toHaveBeenCalled();
      page.openSelection();
      expect(runtime.navigate).toHaveBeenCalledWith("/pages/parent/home/index");
    },
  );
  it.each(["task-detail", "task-submit", "review-detail"])(
    "%s provides recovery for missing selection",
    async (name) => {
      state.childId = "";
      const page = await pageAt(name);
      await page.onLoad({ id: "assignment-child-a" });
      expect(page.data).toMatchObject({ ready: false, selectionRequired: true, loading: false });
      expect(cloud.execute).not.toHaveBeenCalled();
    },
  );
  it("uploads three private images and submits the assignment for the pinned child", async () => {
    const page = await pageAt("task-submit");
    await page.onLoad({ id: "assignment-child-a", childId: "child-a" });
    await page.choosePhoto();
    await page.choosePhoto();
    expect(wx.chooseMedia).toHaveBeenCalledTimes(1);
    expect(page.data.mediaAssetIds).toEqual(["asset-1", "asset-2", "asset-3"]);
    expect(cloud.execute).toHaveBeenCalledWith(
      "CREATE_UPLOAD_INTENT",
      expect.objectContaining({
        assignmentId: "assignment-child-a",
        childId: "child-a",
        purpose: "SUBMISSION_EVIDENCE",
        retentionDays: 90,
      }),
      { mode: "ACCOUNT" },
    );
    await page.submit();
    expect(cloud.execute).toHaveBeenCalledWith(
      "SUBMIT_TASK",
      {
        assignmentId: "assignment-child-a",
        childId: "child-a",
        mediaAssetIds: ["asset-1", "asset-2", "asset-3"],
        mode: "PHOTO",
        text: "",
      },
      { mode: "ACCOUNT" },
    );
    expect(wx.redirectTo).toHaveBeenCalledWith({
      url: "/pages/parent/task-detail/index?id=assignment-child-a&childId=child-a",
    });
  });
  it("uses server revision state and preserves an unsuccessful submission for retry", async () => {
    const base = cloud.execute.getMockImplementation();
    cloud.execute.mockImplementation(async (action, payload) =>
      action === "GET_ASSIGNMENT_DETAIL"
        ? { ok: true, data: { ...task("child-a"), taskState: "REVISION_REQUIRED" } }
        : action === "SUPPLEMENT_SUBMISSION"
          ? { ok: false, error: { message: "暂时不可用" } }
          : base?.(action, payload),
    );
    const page = await pageAt("task-submit");
    await page.onLoad({ id: "assignment-child-a" });
    page.setData({ text: "已订正", mediaAssetIds: ["evidence-a"] });
    await page.submit();
    expect(cloud.execute).toHaveBeenCalledWith(
      "SUPPLEMENT_SUBMISSION",
      expect.objectContaining({
        childId: "child-a",
        assignmentId: "assignment-child-a",
        mediaAssetIds: ["evidence-a"],
      }),
      { mode: "ACCOUNT" },
    );
    expect(page.data).toMatchObject({
      ready: true,
      submitting: false,
      text: "已订正",
      mediaAssetIds: ["evidence-a"],
    });
    expect(wx.redirectTo).not.toHaveBeenCalled();
  });
  it("blocks selection drift during a photo picker and later submission", async () => {
    const page = await pageAt("task-submit");
    await page.onLoad({ id: "assignment-child-a" });
    vi.mocked(wx.chooseMedia).mockImplementationOnce(async () => {
      state.childId = "child-b";
      return { tempFiles: [{ tempFilePath: "wrong-child.png" }] };
    });
    cloud.execute.mockClear();
    await page.choosePhoto();
    await page.submit();
    expect(cloud.execute).not.toHaveBeenCalled();
    await page.onShow();
    expect(page.data).toMatchObject({
      ready: false,
      mediaAssetIds: [],
      previewImages: [],
      text: "",
    });
  });
  it("allows orchard mutations only after a successful selected-child load", async () => {
    const page = await pageAt("orchard");
    await page.onShow();
    await page.startNext({ currentTarget: { dataset: { catalogId: "starter-apple" } } });
    expect(cloud.execute).toHaveBeenCalledWith(
      "START_TREE",
      { childId: "child-a", catalogId: "starter-apple" },
      { mode: "ACCOUNT" },
    );
    state.childId = "child-b";
    await page.onShow();
    expect(page.data).toMatchObject({ selectedChildId: "child-b", selectedName: "乙" });
    expect(cloud.execute).toHaveBeenLastCalledWith(
      "GET_CHILD_ORCHARD",
      { childId: "child-b" },
      { mode: "ACCOUNT" },
    );
    state.failDashboard = true;
    await page.onShow();
    cloud.execute.mockClear();
    await page.startNext({ currentTarget: { dataset: { catalogId: "starter-apple" } } });
    await page.harvest();
    expect(page.data.ready).toBe(false);
    expect(cloud.execute).not.toHaveBeenCalled();
  });
  it("uses the required parent-facing wording in detail and submission", () => {
    expect(readFileSync("miniprogram/pages/parent/task-detail/index.wxml", "utf8")).toContain(
      "为孩子查看任务",
    );
    expect(readFileSync("miniprogram/pages/parent/task-submit/index.wxml", "utf8")).toContain(
      "为孩子提交完成情况",
    );
  });
  it("pins family review navigation, evidence reads, and decisions to the selected child", async () => {
    const list = await pageAt("reviews");
    await list.onShow();
    list.open({ currentTarget: { dataset: { id: "assignment-child-a" } } });
    expect(runtime.navigate).toHaveBeenCalledWith(
      "/pages/parent/review-detail/index?id=assignment-child-a&childId=child-a",
    );
    const base = cloud.execute.getMockImplementation();
    cloud.execute.mockImplementation(async (action, payload) =>
      action === "GET_ASSIGNMENT_DETAIL"
        ? {
            ok: true,
            data: {
              ...task("child-a"),
              taskState: "SUBMITTED",
              rewardState: "PROTECTED",
              submission: { mediaAssetIds: ["evidence-a"], text: "完成了" },
            },
          }
        : base?.(action, payload),
    );
    const detail = await pageAt("review-detail");
    await detail.onLoad({ id: "assignment-child-a", childId: "child-a" });
    expect(cloud.execute).toHaveBeenCalledWith(
      "READ_MEDIA_ASSET",
      { assetId: "evidence-a", childId: "child-a" },
      { mode: "ACCOUNT" },
    );
    await detail.approve();
    expect(cloud.execute).toHaveBeenCalledWith(
      "FAMILY_REVIEW",
      { assignmentId: "assignment-child-a", childId: "child-a", decision: "APPROVE", note: "" },
      { mode: "ACCOUNT" },
    );
    state.childId = "child-b";
    cloud.execute.mockClear();
    await detail.approve();
    expect(cloud.execute).not.toHaveBeenCalled();
    expect(detail.data.ready).toBe(false);
  });
});
