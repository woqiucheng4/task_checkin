import { afterEach, beforeEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  accountShell: vi.fn(),
  command: vi.fn(),
  showError: vi.fn(),
}));
const runtime = vi.hoisted(() => ({
  selectTeacherGroup: vi.fn(),
  teacherGroups: vi.fn(),
  teacherWorkspaceOrganization: vi.fn(),
  teacherWorkspace: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ navigate: vi.fn(), replace: vi.fn() }));

vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/teacher-runtime.js", () => runtime);
vi.mock("../../miniprogram/services/page-runtime.js", () => navigation);

type Definition = {
  data: Record<string, unknown>;
  onShow(this: MiniPageInstance): Promise<void>;
  editCode(this: MiniPageInstance, event: { detail: { value: string } }): void;
  editWorkspaceName(this: MiniPageInstance, event: { detail: { value: string } }): void;
  submitActivation(this: MiniPageInstance): Promise<void>;
  createGroup(this: MiniPageInstance): Promise<void>;
  editGroupName(this: MiniPageInstance, event: { detail: { value: string } }): void;
};

async function loadPage(path: string) {
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", {
    getStorageSync: vi.fn(),
    setStorageSync: vi.fn(),
    showToast: vi.fn(),
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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  runtime.teacherGroups.mockResolvedValue([]);
  runtime.teacherWorkspaceOrganization.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

it("activates a teacher workspace, then routes to groups", async () => {
  session.accountShell.mockResolvedValue({ organizations: [], groups: [], families: [] });
  session.command.mockResolvedValue({ id: "workspace-1", name: "王老师的学习小组" });
  const page = await loadPage("../../miniprogram/pages/teacher/activation/index.js");
  await page.onShow();
  page.editCode({ detail: { value: "ABCD-EFGH" } });
  page.editWorkspaceName({ detail: { value: "王老师的学习小组" } });
  await page.submitActivation();
  expect(session.command).toHaveBeenCalledWith("ACTIVATE_TEACHER_WORKSPACE", {
    code: "ABCD-EFGH",
    workspaceName: "王老师的学习小组",
  });
  expect(navigation.replace).toHaveBeenCalledWith("/pages/teacher/groups/index");
});

it("does not expose group creation before a teacher workspace is activated", async () => {
  session.accountShell.mockResolvedValue({ organizations: [], groups: [], families: [] });
  const page = await loadPage("../../miniprogram/pages/teacher/groups/index.js");
  await page.onShow();
  await page.createGroup();
  expect(session.command).not.toHaveBeenCalledWith("CREATE_GROUP", expect.anything());
  expect(navigation.replace).toHaveBeenCalledWith("/pages/teacher/activation/index");
});

it("creates and selects each learning group in the activated workspace", async () => {
  session.accountShell.mockResolvedValue({
    families: [],
    organizations: [{ id: "workspace-1", type: "TEACHER_WORKSPACE", name: "王老师的学习小组" }],
    groups: [],
  });
  runtime.teacherWorkspaceOrganization.mockResolvedValue({ id: "workspace-1", name: "王老师的学习小组" });
  session.command.mockResolvedValue({ id: "group-2", name: "周末阅读组" });
  const page = await loadPage("../../miniprogram/pages/teacher/groups/index.js");
  await page.onShow();
  page.editGroupName({ detail: { value: "周末阅读组" } });
  await page.createGroup();
  expect(session.command).toHaveBeenCalledWith("CREATE_GROUP", {
    organizationId: "workspace-1",
    name: "周末阅读组",
    type: "LEARNING_GROUP",
  });
  expect(runtime.selectTeacherGroup).toHaveBeenCalledWith("group-2");
  expect(navigation.navigate).toHaveBeenCalledWith("/pages/teacher/members/index");
});
