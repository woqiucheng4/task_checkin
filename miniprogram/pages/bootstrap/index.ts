import {
  accountShell,
  command,
  saveLastLoginRole,
  showError,
  type LoginRole,
} from "../../services/session-runtime.js";
import { uploadAccountAvatar } from "../../services/upload-account-avatar.js";

const ROLE_HOME = {
  parent: "/pages/parent/home/index",
  teacher: "/pages/teacher/home/index",
} as const;
const TEACHER_ACTIVATION = "/pages/teacher/activation/index";
const PARENT_TASK_EDITOR = "/pages/parent/task-editor/index";
const TEACHER_TASK_EDITOR = "/pages/teacher/task-editor/index";
const HOME_PREVIEW_TASKS = [
  {
    action: { kind: "PRIMARY", label: "创建任务" },
    assignmentId: "preview-reading",
    category: "语文",
    dueLabel: "今天完成",
    icon: "book-open",
    sourceLabel: "家庭",
    sourceTone: "family",
    title: "阅读 20 分钟",
  },
  {
    action: { kind: "STATUS", label: "等待开始" },
    assignmentId: "preview-bag",
    category: "自理",
    dueLabel: "明天上学前",
    icon: "home",
    sourceLabel: "家庭",
    sourceTone: "family",
    title: "整理明天的书包",
  },
] as const;
const HOME_PREVIEW_NAVIGATION = [
  {
    activeIcon: "/assets/icons/nav-apple-active.svg",
    icon: "apple-filled",
    inactiveIcon: "/assets/icons/nav-apple-inactive.svg",
    key: "today",
    label: "今日",
    path: "",
    selected: true,
  },
  {
    activeIcon: "/assets/icons/nav-tree-active.svg",
    icon: "tree-round-dot-vertical",
    inactiveIcon: "/assets/icons/nav-tree-inactive.svg",
    key: "orchard",
    label: "果园",
    path: "login",
    selected: false,
  },
  {
    activeIcon: "/assets/icons/nav-user-active.svg",
    icon: "user",
    inactiveIcon: "/assets/icons/nav-user-inactive.svg",
    key: "profile",
    label: "我的",
    path: "login",
    selected: false,
  },
] as const;

type BootstrapPage = {
  readonly data: Readonly<Record<string, unknown>>;
  setData(value: Record<string, unknown>): void;
};

function isLoginRole(value: string): value is LoginRole {
  return value === "parent" || value === "teacher";
}

function roleLabel(role: LoginRole): string {
  return role === "parent" ? "家长" : "教师／助教";
}

function hasParentWorkspace(shell: Awaited<ReturnType<typeof accountShell>>): boolean {
  return shell.families.some((family) => family.children.length > 0);
}

function hasTeacherWorkspace(shell: Awaited<ReturnType<typeof accountShell>>): boolean {
  return shell.organizations.some((organization) => organization.type === "TEACHER_WORKSPACE");
}

function wantsTaskCreation(page: BootstrapPage): boolean {
  return page.data.loginIntent === "CREATE_TASK";
}

async function loginWithRole(page: BootstrapPage, role: LoginRole): Promise<void> {
  if (page.data.loading) return;
  page.setData({ loading: true, notice: "" });
  try {
    // CloudBase supplies the current WeChat OpenID to the cloud function. No
    // profile, phone number, or extra authorization is requested here.
    const shell = await accountShell(true);
    const displayName = String(page.data.accountNickname || "").trim();
    const avatarUrl = String(page.data.accountAvatarUrl || "");
    if (displayName || avatarUrl) {
      const avatarAssetId = avatarUrl ? await uploadAccountAvatar(avatarUrl) : undefined;
      await command("UPDATE_ACCOUNT_PROFILE", {
        ...(displayName ? { displayName } : {}),
        ...(avatarAssetId ? { avatarAssetId } : {}),
      });
    }
    saveLastLoginRole(role);
    if (role === "parent") {
      if (hasParentWorkspace(shell)) {
        wx.redirectTo({ url: wantsTaskCreation(page) ? PARENT_TASK_EDITOR : ROLE_HOME.parent });
        return;
      }
      page.setData({
        familyId: shell.families[0]?.id || "",
        loginVisible: false,
        postLoginPath: wantsTaskCreation(page) ? PARENT_TASK_EDITOR : "",
        setup: true,
      });
      return;
    }
    wx.redirectTo({
      url: hasTeacherWorkspace(shell)
        ? wantsTaskCreation(page)
          ? TEACHER_TASK_EDITOR
          : ROLE_HOME.teacher
        : TEACHER_ACTIVATION,
    });
  } catch (error) {
    page.setData({ notice: error instanceof Error ? error.message : "微信登录失败，请重试" });
  } finally {
    page.setData({ loading: false });
  }
}

Page({
  data: {
    loading: false,
    setup: false,
    familyName: "",
    nickname: "",
    notice: "",
    familyId: "",
    loginVisible: false,
    loginRole: "",
    loginRoleLabel: "",
    loginIntent: "",
    rolePickerVisible: false,
    postLoginPath: "",
    accountNickname: "",
    accountAvatarUrl: "",
    topInset: 44,
    previewTasks: HOME_PREVIEW_TASKS,
    previewNavigation: HOME_PREVIEW_NAVIGATION,
    progressPercent: 60,
    remainingSunlight: 12,
    sunlight: { current: 18, target: 30 },
    tree: {
      asset: "/assets/orchard/apple-reference-lv1-cutout.webp",
      embeddedSign: true,
      level: 1,
      name: "我的果树",
    },
  },
  onLoad(query: { setup?: string; familyId?: string; role?: string; intent?: string }) {
    const windowInfo =
      typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : undefined;
    this.setData({ topInset: Math.max((windowInfo?.statusBarHeight || 20) + 18, 38) });
    if (query.setup === "1") {
      this.setData({
        setup: true,
        familyId: String(query.familyId || ""),
        notice: "",
      });
      return;
    }
    const role = String(query.role || "");
    if (query.intent === "create-task" && isLoginRole(role)) {
      this.setData({
        loginVisible: true,
        loginIntent: "CREATE_TASK",
        loginRole: role,
        loginRoleLabel: roleLabel(role),
      });
    }
  },
  editFamily(event: { detail: { value: string } }) {
    this.setData({ familyName: event.detail.value });
  },
  editChild(event: { detail: { value: string } }) {
    this.setData({ nickname: event.detail.value });
  },
  cancelSetup() {
    this.setData({ notice: "", rolePickerVisible: false, setup: false });
  },
  openTaskCreation() {
    this.setData({ notice: "", rolePickerVisible: true });
  },
  navigatePreviewTab(event: { detail: { path?: string } }) {
    if (event.detail.path) this.setData({ notice: "", rolePickerVisible: true });
  },
  dismissRolePicker() {
    this.setData({ rolePickerVisible: false });
  },
  startTaskLogin(event: {
    readonly currentTarget: { readonly dataset: { readonly role?: string } };
  }) {
    const role = String(event.currentTarget.dataset.role || "");
    if (!isLoginRole(role)) return;
    this.setData({
      loginIntent: "CREATE_TASK",
      loginRole: role,
      loginRoleLabel: roleLabel(role),
      loginVisible: true,
      notice: "",
      rolePickerVisible: false,
    });
  },
  dismissLogin() {
    if (this.data.loading) return;
    this.setData({
      loginVisible: false,
      loginIntent: "",
      loginRole: "",
      loginRoleLabel: "",
      notice: "",
    });
  },
  async login() {
    const role = String(this.data.loginRole);
    if (isLoginRole(role)) await loginWithRole(this, role);
  },
  editAccountNickname(event: { detail: { value: string } }) {
    this.setData({ accountNickname: event.detail.value });
  },
  chooseAccountAvatar(event: { detail: { avatarUrl?: string } }) {
    const avatarUrl = String(event.detail.avatarUrl || "");
    if (avatarUrl) this.setData({ accountAvatarUrl: avatarUrl });
  },
  async createFamily() {
    if (this.data.loading) return;
    if (!String(this.data.nickname).trim()) return showError(new Error("请填写孩子昵称"));
    this.setData({ loading: true, notice: "" });
    try {
      let familyId = String(this.data.familyId || "");
      if (!familyId) {
        const family = await command<{ id: string }>("CREATE_FAMILY", {
          name: String(this.data.familyName).trim() || "我的家庭",
        });
        familyId = family.id;
        this.setData({ familyId });
      }
      await command("ADD_CHILD", { familyId, nickname: String(this.data.nickname).trim() });
      await accountShell(true);
      wx.redirectTo({ url: String(this.data.postLoginPath || ROLE_HOME.parent) });
    } catch (error) {
      this.setData({ notice: error instanceof Error ? error.message : "创建失败，请重试" });
    } finally {
      this.setData({ loading: false });
    }
  },
  async chooseRole(event: {
    readonly currentTarget: { readonly dataset: { readonly role?: string } };
  }) {
    const role = event.currentTarget.dataset.role;
    if (role === "child") {
      wx.redirectTo({ url: `${ROLE_HOME.parent}?legacy=child` });
      return;
    }
    if (role !== "parent" && role !== "teacher") return;

    wx.redirectTo({ url: `${ROLE_HOME[role]}?guest=1` });
  },
});
