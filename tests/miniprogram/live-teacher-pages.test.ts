import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
const teacher = vi.hoisted(() => ({
  selectedTeacherGroup: async () => ({
    id: "group-real",
    name: "真实班级",
    organizationName: "真实学校",
    role: "TEACHER",
  }),
  teacherGroups: async () => [{ id: "group-real", name: "真实班级" }],
  teacherWorkspaceOrganization: async () => ({ id: "workspace-real", name: "真实学校" }),
  selectTeacherGroup: vi.fn(),
  teacherWorkspace: async () => ({
    group: { id: "group-real", name: "真实班级", organizationName: "真实学校" },
    members: [{ organizationMemberId: "member-real", displayName: "已授权昵称" }],
    tasks: [
      {
        id: "task-real",
        title: "真实任务",
        dueAt: "2026-09-07T15:00:00Z",
        status: "PUBLISHED",
        assignmentCount: 1,
        completedCount: 0,
      },
    ],
    groupTree: { id: "tree-real", status: "MATURE", progress: 10, threshold: 10 },
  }),
}));
const session = vi.hoisted(() => ({
  accountShell: async () => ({
    account: { avatarAssetId: "avatar-real", displayName: "王老师" },
    families: [],
    organizations: [],
  }),
  today: () => "2026-09-07",
  showError: vi.fn(),
  command: vi.fn(async (action: string) => {
    if (action === "GET_TEACHER_DASHBOARD")
      return { metrics: { dueToday: 1, pendingReview: 1, revisionRequired: 0 } };
    if (action === "GET_GROUP_SUBMISSIONS")
      return [
        {
          id: "assignment-real",
          taskId: "task-real",
          name: "已授权昵称",
          title: "真实任务",
          taskState: "SUBMITTED",
          academicState: "PENDING",
          submittedAt: "2026-09-07T08:00:00Z",
        },
      ];
    if (action === "GET_GROUP_JOIN_REQUESTS") return [{ id: "join-real", name: "待加入成员" }];
    if (action === "CREATE_GROUP_INVITATION")
      return { code: "invite-real", expiresAt: "2026-09-10T00:00:00Z" };
    if (action === "GET_ASSIGNMENT_DETAIL")
      return {
        title: "真实任务",
        source: "SCHOOL",
        taskState: "SUBMITTED",
        academicState: "PENDING",
        submission: { text: "已完成内容", mediaAssetIds: [], submittedAt: "2026-09-07T08:00:00Z" },
      };
    if (action === "READ_MEDIA_ASSET")
      return { downloadUrl: "https://private.invalid/avatar-real" };
    return { id: "result-real" };
  }),
}));
vi.mock("../../miniprogram/services/teacher-runtime.js", () => teacher);
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => ({
  navigate: vi.fn(),
  replace: vi.fn(),
  coreApiClient: { execute: async () => ({ ok: true, data: {} }) },
}));
afterEach(() => vi.unstubAllGlobals());
type Definition = {
  data: Record<string, unknown>;
  onShow(this: MiniPageInstance): Promise<void>;
  onLoad(this: MiniPageInstance, query: { id?: string; task?: string }): Promise<void>;
  publish(this: MiniPageInstance): Promise<void>;
  createInvite(this: MiniPageInstance): Promise<void>;
  approve(
    this: MiniPageInstance,
    event?: { currentTarget: { dataset: { id: string } } },
  ): Promise<void>;
  harvest(this: MiniPageInstance): Promise<void>;
  chooseFilter(
    this: MiniPageInstance,
    event: { currentTarget: { dataset: { filter: string } } },
  ): void;
};
async function loadPage(path: string) {
  let definition: Definition | undefined;
  vi.resetModules();
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", {
    showToast: vi.fn(),
    navigateBack: vi.fn(),
    getStorageSync: () => undefined,
    setStorageSync: vi.fn(),
  });
  await import(path);
  if (!definition) throw new Error("Page not registered");
  return {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
}
it("loads current teacher work and actual submissions", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/home/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({
    groupName: "真实班级",
    submissions: [{ id: "assignment-real", name: "已授权昵称", title: "真实任务" }],
  });
});
it("loads only the selected group's real tasks", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/tasks/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({ tasks: [{ id: "task-real", title: "真实任务", total: 1 }] });
});
it("publishes with real group and current date instead of hardcoded past IDs", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/task-editor/index.js");
  await page.onLoad({});
  page.setData({ title: "新的任务" });
  await page.publish();
  expect(session.command).toHaveBeenCalledWith(
    "PUBLISH_GROUP_TASK",
    expect.objectContaining({
      groupId: "group-real",
      title: "新的任务",
      occurrenceDate: "2026-09-07",
      dueAt: "2026-09-07T15:59:00.000Z",
    }),
  );
});
it("approves the actual pending request and produces a usable invitation code", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/members/index.js");
  await page.onShow();
  await page.approve({ currentTarget: { dataset: { id: "join-real" } } });
  await page.createInvite();
  expect(session.command).toHaveBeenCalledWith("APPROVE_JOIN_REQUEST", {
    joinRequestId: "join-real",
  });
  expect(page.data).toMatchObject({ inviteCode: "invite-real" });
});
it("reads evidence before issuing the selected assignment's academic review", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/review-detail/index.js");
  await page.onLoad({ id: "assignment-real" });
  expect(page.data).toMatchObject({
    title: "真实任务",
    submissionText: "已完成内容",
    canReview: true,
  });
  await page.approve();
  expect(session.command).toHaveBeenCalledWith(
    "ACADEMIC_REVIEW",
    expect.objectContaining({ assignmentId: "assignment-real", decision: "APPROVE" }),
  );
});
it("can harvest the real mature group tree", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/group-tree/index.js");
  await page.onShow();
  await page.harvest();
  expect(session.command).toHaveBeenCalledWith("HARVEST_GROUP_TREE", {
    groupTreeId: "tree-real",
    title: "真实班级的共同收获",
  });
});
it("renders actual groups and member counts", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/groups/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({
    selected: "group-real",
    groupName: "真实班级",
    memberCount: 1,
  });
});
it("filters actual assignment review states", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/reviews/index.js");
  await page.onLoad({ task: "task-real" });
  await page.onShow();
  expect(page.data).toMatchObject({ items: [{ id: "assignment-real", name: "已授权昵称" }] });
  page.chooseFilter({ currentTarget: { dataset: { filter: "DONE" } } });
  expect(page.data.items).toEqual([]);
});
it("shows real teacher authorization without inventing a teacher identity", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/profile/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({
    groupName: "真实班级",
    organizationName: "真实学校",
    roleLabel: "教师",
  });
});
it("loads account information and renders its edit controls in the teacher profile", async () => {
  const page = await loadPage("../../miniprogram/pages/teacher/profile/index.js");
  await page.onShow();

  expect(page.data).toMatchObject({
    accountAvatarUrl: "https://private.invalid/avatar-real",
    accountNickname: "王老师",
  });
  const markup = readFileSync("miniprogram/pages/teacher/profile/index.wxml", "utf8");
  expect(markup).toContain('open-type="chooseAvatar"');
  expect(markup).toContain('type="nickname"');
  expect(markup).toContain('bindtap="saveAccountProfile"');
});
