import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const sessionRuntime = vi.hoisted(() => ({
  accountShell: vi.fn(),
  command: vi.fn(),
  lastLoginRole: vi.fn(),
  saveLastLoginRole: vi.fn(),
  showError: vi.fn(),
}));

const accountProfile = vi.hoisted(() => ({
  uploadAccountAvatar: vi.fn(),
}));

vi.mock("../../miniprogram/services/session-runtime.js", () => ({
  accountShell: sessionRuntime.accountShell,
  command: sessionRuntime.command,
  lastLoginRole: sessionRuntime.lastLoginRole,
  saveLastLoginRole: sessionRuntime.saveLastLoginRole,
  showError: sessionRuntime.showError,
}));

vi.mock("../../miniprogram/services/upload-account-avatar.js", () => ({
  uploadAccountAvatar: accountProfile.uploadAccountAvatar,
}));

type ShellDefinition = {
  methods: {
    backToBootstrap(): void;
  };
};

type BootstrapDefinition = {
  data: Record<string, unknown>;
  cancelSetup(this: { setData(value: Record<string, unknown>): void }): void;
  dismissGrowthGuide?(this: { setData(value: Record<string, unknown>): void }): void;
  onLoad(
    this: { setData(value: Record<string, unknown>): void },
    query: { setup?: string; familyId?: string; role?: string; intent?: string },
  ): void;
  chooseRole(
    this: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void },
    event: { readonly currentTarget: { readonly dataset: { readonly role?: string } } },
  ): void;
  dismissLogin(this: {
    data: Record<string, unknown>;
    setData(value: Record<string, unknown>): void;
  }): void;
  openTaskCreation(this: { setData(value: Record<string, unknown>): void }): void;
  startTaskLogin(
    this: { setData(value: Record<string, unknown>): void },
    event: { readonly currentTarget: { readonly dataset: { readonly role?: string } } },
  ): void;
  login(this: {
    data: Record<string, unknown>;
    setData(value: Record<string, unknown>): void;
  }): Promise<void>;
  openGrowthGuide?(this: { setData(value: Record<string, unknown>): void }): void;
};

type OrchardHeroDefinition = {
  methods?: {
    openGrowthGuide?(this: { triggerEvent(name: string): void }): void;
  };
};

type RoleSwitcherDefinition = {
  data: Record<string, unknown>;
  onShow(this: { setData(value: Record<string, unknown>): void }): Promise<void>;
  choose(event: { currentTarget: { dataset: { path?: string } } }): void;
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  sessionRuntime.accountShell.mockReset();
  sessionRuntime.command.mockReset();
  sessionRuntime.lastLoginRole.mockReset();
  sessionRuntime.saveLastLoginRole.mockReset();
  sessionRuntime.showError.mockReset();
  accountProfile.uploadAccountAvatar.mockReset();
});

describe("身份入口与二级页面导航", () => {
  it("小树说明入口向页面发出查看指南事件", async () => {
    let definition: OrchardHeroDefinition | undefined;
    const triggerEvent = vi.fn();
    vi.stubGlobal("Component", (value: OrchardHeroDefinition) => {
      definition = value;
    });

    const componentPath = "../../miniprogram/components/orchard-hero/index.js";
    await import(componentPath);
    if (!definition) throw new Error("orchard hero component not registered");

    definition.methods?.openGrowthGuide?.call({ triggerEvent });

    expect(triggerEvent).toHaveBeenCalledWith("guide");
    const markup = readFileSync("miniprogram/components/orchard-hero/index.wxml", "utf8");
    expect(markup).toContain('bindtap="openGrowthGuide"');
    expect(markup).toContain('aria-label="查看小树成长指南"');
  });

  it("首页能打开并关闭小树成长指南", async () => {
    let definition: BootstrapDefinition | undefined;
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", {});

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data };
    const page = {
      setData(value: Record<string, unknown>) {
        Object.assign(data, value);
      },
    };

    definition.openGrowthGuide?.call(page);
    expect(data).toMatchObject({ growthGuideVisible: true });
    definition.dismissGrowthGuide?.call(page);
    expect(data).toMatchObject({ growthGuideVisible: false });

    const markup = readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8");
    expect(markup).toContain('bindguide="openGrowthGuide"');
    expect(markup).toContain('wx:if="{{growthGuideVisible}}"');
    expect(markup).toContain("完成任务并经家长确认后");
    expect(markup).not.toContain("growth-guide-reference.webp");
  });

  it("角色页面的返回按钮重新打开身份选择首页", async () => {
    let definition: ShellDefinition | undefined;
    const reLaunch = vi.fn();
    vi.stubGlobal("wx", { reLaunch });
    vi.stubGlobal("Component", (value: ShellDefinition) => {
      definition = value;
    });

    const componentPath = "../../miniprogram/components/app-shell/index.js";
    await import(componentPath);
    if (!definition) throw new Error("app-shell component not registered");

    definition.methods.backToBootstrap();

    expect(reLaunch).toHaveBeenCalledWith({ url: "/pages/bootstrap/index" });
    const markup = readFileSync("miniprogram/components/app-shell/index.wxml", "utf8");
    const styles = readFileSync("miniprogram/components/app-shell/index.wxss", "utf8");
    expect(markup).toContain('class="shell__back"');
    expect(markup).toContain('bindtap="backToBootstrap"');
    expect(styles).toMatch(/\.shell__back\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it("家庭创建状态可以返回身份列表", async () => {
    let definition: BootstrapDefinition | undefined;
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", {});

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data, notice: "连接失败", setup: true };

    definition.cancelSetup.call({
      setData(value) {
        Object.assign(data, value);
      },
    });

    expect(data).toMatchObject({ notice: "", setup: false });
  });

  it("家庭创建主按钮使用不会挤成竖排的独立布局", () => {
    const markup = readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8");
    const styles = readFileSync("miniprogram/pages/bootstrap/index.wxss", "utf8");

    expect(markup).toContain('class="setup__back"');
    expect(markup).toContain('class="setup__submit"');
    expect(markup).not.toMatch(/class="role role--primary"[^>]*bindtap="createFamily"/);
    expect(styles).toMatch(/\.setup__submit\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it("首页启动不校验账号，也不自动弹出微信登录", async () => {
    let definition: BootstrapDefinition | undefined;
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo: vi.fn() });
    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data };
    definition.onLoad.call(
      {
        data,
        setData(value) {
          Object.assign(data, value);
        },
      },
      {},
    );

    expect(data).toMatchObject({ loginVisible: false, loginRole: "" });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
  });

  it("登录面板以番茄红主操作和森林绿次操作区分登录与暂不登录", () => {
    const markup = readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8");
    const styles = readFileSync("miniprogram/pages/bootstrap/index.wxss", "utf8");

    expect(markup).toContain('class="login-sheet__submit"');
    expect(markup).toContain('class="login-sheet__dismiss"');
    expect(styles).toMatch(
      /\.login-sheet__submit\s*\{[^}]*border:\s*2rpx solid #d93a22[^}]*background:\s*#d93a22/s,
    );
    expect(styles).toMatch(
      /\.login-sheet__dismiss\s*\{[^}]*border:\s*2rpx solid #315b3d[^}]*background:\s*#fffdf7[^}]*color:\s*#315b3d/s,
    );
  });

  it("登录面板只负责身份确认，不包含账号资料编辑", () => {
    const markup = readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8");
    const styles = readFileSync("miniprogram/pages/bootstrap/index.wxss", "utf8");

    expect(markup).not.toContain("profile-consent");
    expect(markup).not.toContain('open-type="chooseAvatar"');
    expect(markup).toContain("仅用于账号识别，不读取手机号。");
    expect(styles).not.toContain(".profile-consent");
  });

  it("首页直接展示果树与任务示例，点击创建任务只打开身份选择", async () => {
    let definition: BootstrapDefinition | undefined;
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", {});

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data };
    definition.openTaskCreation.call({
      setData(value) {
        Object.assign(data, value);
      },
    });

    expect(data).toMatchObject({ loginVisible: false, rolePickerVisible: true });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
    const markup = readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8");
    expect(markup).toContain("今日任务");
    expect(markup).toContain("来自学校和家庭的 3 项任务");
    expect(markup).toContain("{{dateLabel}}");
    expect(markup).toContain('bindguide="openGrowthGuide"');
    expect(markup).not.toContain("growth-guide-reference.webp");
    expect(markup).not.toContain("创建我的任务");
    expect(markup).toContain(
      '<bottom-nav items="{{previewNavigation}}" bindnavigate="navigatePreviewTab" />',
    );
    expect(readFileSync("miniprogram/pages/bootstrap/index.ts", "utf8")).toContain(
      "apple-reference-lv1-cutout.webp",
    );
    const navigationMarkup = readFileSync("miniprogram/components/bottom-nav/index.wxml", "utf8");
    expect(navigationMarkup).toContain(
      'src="{{item.selected ? item.activeIcon : item.inactiveIcon}}"',
    );
    const navigation = readFileSync("miniprogram/pages/bootstrap/index.ts", "utf8");
    expect(navigation).toContain('icon: "apple-filled"');
    expect(navigation).toContain('icon: "tree-round-dot-vertical"');
    expect(navigation).toContain('title: "数学 · 完成练习题 5 道"');
    expect(navigation).toContain('statusDetail: "已提交 09:48"');
  });

  it.each(["parent", "teacher"] as const)("选择 %s 创建任务时才打开微信登录面板", async (role) => {
    let definition: BootstrapDefinition | undefined;
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", {});

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data };
    definition.startTaskLogin.call(
      {
        setData(value) {
          Object.assign(data, value);
        },
      },
      { currentTarget: { dataset: { role } } },
    );

    expect(data).toMatchObject({ loginIntent: "CREATE_TASK", loginRole: role, loginVisible: true });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
  });

  it("登录时请求微信资料并保存昵称和头像", async () => {
    let definition: BootstrapDefinition | undefined;
    const getUserProfile = vi.fn().mockResolvedValue({
      userInfo: { avatarUrl: "wxfile://avatar.png", nickName: "果果妈妈" },
    });
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { getUserProfile, redirectTo: vi.fn() });
    sessionRuntime.accountShell.mockResolvedValueOnce({
      families: [{ children: [{ id: "child-1" }], id: "family-1" }],
      organizations: [],
    });
    accountProfile.uploadAccountAvatar.mockResolvedValueOnce("avatar-asset-1");

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data, loginRole: "parent" };
    await definition.login.call({
      data,
      setData(value) {
        Object.assign(data, value);
      },
    });

    expect(getUserProfile).toHaveBeenCalledWith({ desc: "用于展示账号昵称和头像" });
    expect(accountProfile.uploadAccountAvatar).toHaveBeenCalledWith("wxfile://avatar.png");
    expect(sessionRuntime.command).toHaveBeenCalledWith("UPDATE_ACCOUNT_PROFILE", {
      avatarAssetId: "avatar-asset-1",
      displayName: "果果妈妈",
    });
  });

  it("微信头像暂时无法同步时，仍保存昵称并完成登录", async () => {
    let definition: BootstrapDefinition | undefined;
    const redirectTo = vi.fn();
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", {
      getUserProfile: vi.fn().mockResolvedValue({
        userInfo: { avatarUrl: "https://thirdwx.qlogo.cn/avatar.png", nickName: "果果妈妈" },
      }),
      redirectTo,
    });
    sessionRuntime.accountShell.mockResolvedValueOnce({
      families: [{ children: [{ id: "child-1" }], id: "family-1" }],
      organizations: [],
    });
    accountProfile.uploadAccountAvatar.mockRejectedValueOnce(new Error("头像下载失败，请重试"));

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data, loginRole: "parent" };
    await definition.login.call({
      data,
      setData(value) {
        Object.assign(data, value);
      },
    });

    expect(sessionRuntime.command).toHaveBeenCalledWith("UPDATE_ACCOUNT_PROFILE", {
      displayName: "果果妈妈",
    });
    expect(sessionRuntime.saveLastLoginRole).toHaveBeenCalledWith("parent");
    expect(redirectTo).toHaveBeenCalledWith({ url: "/pages/parent/home/index" });
  });

  it("仅从创建任务入口打开家长登录，建档后回到任务编辑", async () => {
    let definition: BootstrapDefinition | undefined;
    const redirectTo = vi.fn();
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo });
    sessionRuntime.accountShell.mockResolvedValueOnce({
      families: [{ id: "family-1", children: [] }],
      organizations: [],
    });

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data };
    const page = {
      data,
      setData(value: Record<string, unknown>) {
        Object.assign(data, value);
      },
    };
    definition.onLoad.call(page, { role: "parent", intent: "create-task" });
    await definition.login.call(page);

    expect(sessionRuntime.accountShell).toHaveBeenCalledWith(true);
    expect(sessionRuntime.saveLastLoginRole).toHaveBeenCalledWith("parent");
    expect(data).toMatchObject({
      familyId: "family-1",
      loginVisible: false,
      postLoginPath: "/pages/parent/task-editor/index",
      setup: true,
    });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("仅从创建任务入口打开教师登录，未激活时进入激活页", async () => {
    let definition: BootstrapDefinition | undefined;
    const redirectTo = vi.fn();
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo });
    sessionRuntime.accountShell.mockResolvedValueOnce({ families: [], organizations: [] });

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    const data = { ...definition.data };
    const page = {
      data,
      setData(value: Record<string, unknown>) {
        Object.assign(data, value);
      },
    };
    definition.onLoad.call(page, { role: "teacher", intent: "create-task" });
    await definition.login.call(page);

    expect(redirectTo).toHaveBeenCalledWith({ url: "/pages/teacher/activation/index" });
  });

  it("不再渲染孩子入口，并将旧孩子点击安全地交给家长流程", async () => {
    let definition: BootstrapDefinition | undefined;
    const redirectTo = vi.fn();
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo });

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    await definition.chooseRole.call(
      { data: { ...definition.data }, setData: vi.fn() },
      { currentTarget: { dataset: { role: "child" } } },
    );

    expect(readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8")).not.toContain(
      "我是孩子",
    );
    expect(redirectTo).toHaveBeenCalledWith({ url: "/pages/parent/home/index?legacy=child" });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
  });

  it("角色切换只提供同一账户可用的家长和教师能力", async () => {
    let definition: RoleSwitcherDefinition | undefined;
    const redirectTo = vi.fn();
    vi.stubGlobal("Page", (value: RoleSwitcherDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo });
    sessionRuntime.accountShell.mockResolvedValueOnce({
      families: [{ id: "family-1", children: [{ id: "child-1" }] }],
      organizations: [{ id: "organization-1", type: "TEACHER_WORKSPACE" }],
    });

    await import("../../miniprogram/pages/shared/role-switcher/index.js");
    if (!definition) throw new Error("role switcher page not registered");
    const data = { ...definition.data };
    await definition.onShow.call({
      setData(value) {
        Object.assign(data, value);
      },
    });

    expect(data.roles).toEqual([
      { label: "家长", path: "/pages/parent/home/index" },
      { label: "教师／助教", path: "/pages/teacher/home/index" },
    ]);
    expect(readFileSync("miniprogram/pages/shared/role-switcher/index.wxml", "utf8")).not.toContain(
      "孩子",
    );

    definition.choose({ currentTarget: { dataset: { path: "/pages/child/today/index" } } });
    expect(redirectTo).toHaveBeenCalledWith({ url: "/pages/parent/home/index?legacy=child" });
  });

  it("角色切换为不可用能力保留家庭创建和教师激活恢复入口", async () => {
    let definition: RoleSwitcherDefinition | undefined;
    vi.stubGlobal("Page", (value: RoleSwitcherDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo: vi.fn() });
    sessionRuntime.accountShell.mockResolvedValueOnce({
      families: [{ id: "family-1", children: [] }],
      organizations: [],
    });

    await import("../../miniprogram/pages/shared/role-switcher/index.js");
    if (!definition) throw new Error("role switcher page not registered");
    const data = { ...definition.data };
    await definition.onShow.call({
      setData(value) {
        Object.assign(data, value);
      },
    });

    expect(data.roles).toEqual([
      { label: "创建我的家庭", path: "/pages/bootstrap/index" },
      { label: "教师／助教", path: "/pages/teacher/activation/index" },
    ]);
  });
});
