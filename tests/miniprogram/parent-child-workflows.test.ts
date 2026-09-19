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
      today: { items: [] as ReturnType<typeof task>[], pendingReviewCount: 0 },
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
  it.each([
    ["PENDING", "待完成", true],
    ["REVISION_REQUIRED", "需要订正", true],
    ["SUBMITTED", "完成情况已提交", false],
    ["COMPLETED", "任务已完成", false],
    ["EXPIRED", "任务已过期", false],
    ["CANCELLED", "任务已取消", false],
    ["EXCUSED", "任务已免做", false],
  ] as const)(
    "preserves %s without treating terminal tasks as submitted",
    async (taskState, statusTitle, canSubmit) => {
      const base = cloud.execute.getMockImplementation();
      cloud.execute.mockImplementation(async (action, payload) =>
        action === "GET_ASSIGNMENT_DETAIL"
          ? { ok: true, data: { ...task("child-a"), taskState } }
          : base?.(action, payload),
      );
      const detail = await pageAt("task-detail");
      await detail.onLoad({ id: "assignment-child-a", childId: "child-a" });
      expect(detail.data).toMatchObject({
        ready: true,
        state: taskState,
        statusTitle,
        canSubmit,
        hasSubmission: false,
        submissionImages: [],
      });
      await detail.openSubmit();
      if (canSubmit)
        expect(runtime.navigate).toHaveBeenCalledWith(
          "/pages/parent/task-submit/index?id=assignment-child-a&childId=child-a",
        );
      else expect(runtime.navigate).not.toHaveBeenCalled();
      if (["EXPIRED", "CANCELLED", "EXCUSED"].includes(taskState))
        expect(detail.data.statusTitle).not.toMatch(/已提交|已记录|已完成/);
    },
  );
  it.each([
    ["home", "FAMILY"],
    ["home", "LEARNING_GROUP"],
    ["tasks", "FAMILY"],
    ["tasks", "LEARNING_GROUP"],
  ] as const)(
    "keeps submitted %s / %s results accessible with private evidence",
    async (entry, source) => {
      const result = {
        ...task("child-a"),
        source,
        taskState: "SUBMITTED",
        academicState: source === "FAMILY" ? "NOT_REQUIRED" : "PENDING",
        submission: {
          id: "submission-a",
          text: "已完成第二页练习",
          mediaAssetIds: ["evidence-private"],
          submittedAt: "2026-09-19T09:00:00Z",
          revision: 1,
        },
      };
      session.dashboard.mockResolvedValueOnce({
        ...(await session.dashboard()),
        today: { items: [result], pendingReviewCount: 1 },
      });
      const base = cloud.execute.getMockImplementation();
      cloud.execute.mockImplementation(async (action, payload) => {
        if (action === "GET_PARENT_TASK_CENTER")
          return { ok: true, data: { child: { id: "child-a" }, items: [result] } };
        if (action === "GET_ASSIGNMENT_DETAIL") return { ok: true, data: result };
        if (action === "READ_MEDIA_ASSET")
          return {
            ok: true,
            data: { downloadUrl: `https://private.invalid/signed-${payload.assetId}` },
          };
        return base?.(action, payload);
      });
      const list = await pageAt(entry);
      await list.onShow();
      expect(list.data.tasks).toEqual([
        expect.objectContaining({ assignmentId: "assignment-child-a" }),
      ]);
      list.openTask({ detail: { assignmentId: "assignment-child-a" } });
      expect(runtime.navigate).toHaveBeenCalledWith(
        "/pages/parent/task-detail/index?id=assignment-child-a&childId=child-a",
      );
      const detail = await pageAt("task-detail");
      await detail.onLoad({ id: "assignment-child-a", childId: "child-a" });
      expect(detail.data).toMatchObject({
        state: "SUBMITTED",
        hasSubmission: true,
        submissionText: "已完成第二页练习",
        submittedAt: "2026-09-19T09:00:00Z",
        submissionRevision: 1,
        images: ["https://private.invalid/signed-source-private"],
        submissionImages: ["https://private.invalid/signed-evidence-private"],
        academicState: result.academicState,
        academicLabel: source === "FAMILY" ? "无需老师审核" : "等待老师审核",
        showAcademic: source !== "FAMILY",
        canSubmit: false,
      });
      expect(cloud.execute).toHaveBeenCalledWith(
        "READ_MEDIA_ASSET",
        { assetId: "evidence-private", childId: "child-a" },
        { mode: "ACCOUNT" },
      );
      expect(cloud.execute.mock.calls.map(([action]) => action)).not.toContain("ACADEMIC_REVIEW");
      state.childId = "child-b";
      await detail.onShow();
      expect(detail.data).toMatchObject({
        ready: false,
        hasSubmission: false,
        submissionText: "",
        submissionImages: [],
        images: [],
        academicState: "",
        academicLabel: "",
      });
    },
  );
  it.each([
    ["APPROVED", "COMPLETED", "老师已通过"],
    ["REVISION_REQUIRED", "REVISION_REQUIRED", "老师要求订正"],
    ["EXCUSED", "EXCUSED", "老师已免除"],
  ])(
    "displays the teacher's %s evaluation as read-only",
    async (academicState, taskState, academicLabel) => {
      const base = cloud.execute.getMockImplementation();
      cloud.execute.mockImplementation(async (action, payload) =>
        action === "GET_ASSIGNMENT_DETAIL"
          ? {
              ok: true,
              data: { ...task("child-a"), source: "LEARNING_GROUP", academicState, taskState },
            }
          : base?.(action, payload),
      );
      const detail = await pageAt("task-detail");
      await detail.onLoad({ id: "assignment-child-a" });
      expect(detail.data).toMatchObject({
        showAcademic: true,
        academicState,
        academicLabel,
        state: taskState,
      });
      const template = readFileSync("miniprogram/pages/parent/task-detail/index.wxml", "utf8");
      expect(template).toContain("{{academicLabel}}");
      expect(template).toContain("{{submissionText");
      expect(template).toContain('wx:for="{{submissionImages}}"');
      expect(template).not.toMatch(/bindtap="(?:approve|revise|waive)"/);
    },
  );
  it("does not expose submission results when private evidence authorization fails", async () => {
    const base = cloud.execute.getMockImplementation();
    cloud.execute.mockImplementation(async (action, payload) => {
      if (action === "GET_ASSIGNMENT_DETAIL")
        return {
          ok: true,
          data: {
            ...task("child-a"),
            taskState: "SUBMITTED",
            source: "LEARNING_GROUP",
            submission: {
              text: "私密提交",
              mediaAssetIds: ["evidence-revoked"],
              submittedAt: "2026-09-19T09:00:00Z",
              revision: 1,
            },
          },
        };
      if (action === "READ_MEDIA_ASSET" && payload.assetId === "evidence-revoked")
        return { ok: false, error: { message: "授权已失效" } };
      return base?.(action, payload);
    });
    const detail = await pageAt("task-detail");
    await detail.onLoad({ id: "assignment-child-a" });
    expect(detail.data).toMatchObject({
      ready: false,
      error: "授权已失效",
      hasSubmission: false,
      submissionText: "",
      submissionImages: [],
      images: [],
      canSubmit: false,
    });
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
