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
    action: { kind: "PRIMARY", label: "去完成" },
    assignmentId: "preview-reading",
    category: "语文",
    description: "认真朗读课文，录音 2 分钟",
    dueLabel: "截止时间　今天 20:00",
    icon: "book-open",
    sourceLabel: "学校",
    sourceTone: "school",
    title: "语文 · 朗读《秋天的雨》",
  },
  {
    action: { kind: "PRIMARY", label: "去完成" },
    assignmentId: "preview-math",
    category: "数学",
    description: "拍照上传作业结果",
    dueLabel: "截止时间　今天 21:00",
    icon: "calculation",
    sourceLabel: "学校",
    sourceTone: "school",
    title: "数学 · 完成练习题 5 道",
  },
  {
    action: { kind: "STATUS", label: "待确认 · 阳光已保护" },
    assignmentId: "preview-desk",
    category: "自理",
    description: "分类摆放书本和文具，保持整洁",
    dueLabel: "截止时间　今天 22:00",
    icon: "home",
    sourceLabel: "家庭",
    sourceTone: "family",
    statusDetail: "已提交 09:48",
    title: "整理自己的书桌",
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
const GROWTH_GUIDE_STAGES = [
  { name: "种子", progress: "0%", description: "把今天的小目标种下，成长从这里开始。" },
  { name: "破土", progress: "8%", description: "坚持完成任务，小芽悄悄探出头。" },
  { name: "嫩芽", progress: "16%", description: "新叶舒展，每一份努力都被看见。" },
  { name: "树干", progress: "25%", description: "小树站得更稳，继续积攒阳光。" },
  { name: "长叶", progress: "34%", description: "枝头渐渐茂盛，习惯正在养成。" },
  { name: "花苞", progress: "42%", description: "小小花苞出现，离收获又近一步。" },
  { name: "开花", progress: "50%", description: "花儿盛开，为持续的努力喝彩。" },
  { name: "小果", progress: "65%", description: "果实初长成，保持节奏继续前进。" },
  { name: "果实变大", progress: "82%", description: "果子越来越饱满，收获就在眼前。" },
  { name: "成熟采摘", progress: "100%", description: "小树成熟，可以采摘这份成长的果实。" },
] as const;

type BootstrapPage = {
  readonly data: Readonly<Record<string, unknown>>;
  setData(value: Record<string, unknown>): void;
};

type WechatProfile = {
  readonly avatarUrl: string;
  readonly displayName: string;
};

const WEEKDAY_LABELS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function currentJournalDate(): { readonly dateLabel: string; readonly weekdayLabel: string } {
  const today = new Date();
  return {
    dateLabel: `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`,
    weekdayLabel: WEEKDAY_LABELS[today.getDay()] || "",
  };
}

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

async function requestWechatProfile(): Promise<WechatProfile> {
  try {
    const { userInfo } = await wx.getUserProfile({ desc: "用于展示账号昵称和头像" });
    return {
      avatarUrl: String(userInfo.avatarUrl || ""),
      displayName: String(userInfo.nickName || "").trim(),
    };
  } catch {
    return { avatarUrl: "", displayName: "" };
  }
}

async function loginWithRole(
  page: BootstrapPage,
  role: LoginRole,
  profile: WechatProfile,
): Promise<void> {
  if (page.data.loading) return;
  page.setData({ loading: true, notice: "" });
  try {
    // CloudBase supplies the current WeChat OpenID to the cloud function.
    const shell = await accountShell(true);
    const { displayName, avatarUrl } = profile;
    if (displayName || avatarUrl) {
      // Profile avatars are served from a WeChat domain. If that domain has
      // not been configured for downloads yet, do not make a valid account
      // login fail; the account page remains available for choosing an avatar.
      const avatarAssetId = avatarUrl
        ? await uploadAccountAvatar(avatarUrl).catch(() => undefined)
        : undefined;
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
    growthGuideVisible: false,
    growthGuideStages: GROWTH_GUIDE_STAGES,
    topInset: 44,
    ...currentJournalDate(),
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
    const windowInfo = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : undefined;
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
  openGrowthGuide() {
    this.setData({ growthGuideVisible: true });
  },
  dismissGrowthGuide() {
    this.setData({ growthGuideVisible: false });
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
    if (isLoginRole(role)) await loginWithRole(this, role, await requestWechatProfile());
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
