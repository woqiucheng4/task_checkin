import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const sessionRuntime = vi.hoisted(() => ({
  accountShell: vi.fn(),
  command: vi.fn(),
  lastLoginRole: vi.fn(),
  saveLastLoginRole: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("../../miniprogram/services/session-runtime.js", () => ({
  accountShell: sessionRuntime.accountShell,
  command: sessionRuntime.command,
  lastLoginRole: sessionRuntime.lastLoginRole,
  saveLastLoginRole: sessionRuntime.saveLastLoginRole,
  showError: sessionRuntime.showError,
}));

type ShellDefinition = {
  methods: {
    backToBootstrap(): void;
  };
};

type BootstrapDefinition = {
  data: Record<string, unknown>;
  cancelSetup(this: { setData(value: Record<string, unknown>): void }): void;
  onLoad(
    this: { setData(value: Record<string, unknown>): void },
    query: { setup?: string; familyId?: string; role?: string; intent?: string },
  ): void;
  chooseRole(
    this: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void },
    event: { readonly currentTarget: { readonly dataset: { readonly role?: string } } },
  ): void;
  dismissLogin(this: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void }): void;
  openTaskCreation(this: { setData(value: Record<string, unknown>): void }): void;
  startTaskLogin(
    this: { setData(value: Record<string, unknown>): void },
    event: { readonly currentTarget: { readonly dataset: { readonly role?: string } } },
  ): void;
  login(this: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void }): Promise<void>;
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
});

describe("身份入口与二级页面导航", () => {
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
    definition.onLoad.call({ data, setData(value) { Object.assign(data, value); } }, {});

    expect(data).toMatchObject({ loginVisible: false, loginRole: "" });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
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
    definition.openTaskCreation.call({ setData(value) { Object.assign(data, value); } });

    expect(data).toMatchObject({ loginVisible: false, rolePickerVisible: true });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
    const markup = readFileSync("miniprogram/pages/bootstrap/index.wxml", "utf8");
    expect(markup).toContain("今日任务");
    expect(markup).toContain("growth-guide-reference.webp");
    expect(markup).toContain("创建我的任务");
    expect(markup).toContain('<bottom-nav items="{{previewNavigation}}" bindnavigate="navigatePreviewTab" />');
    expect(readFileSync("miniprogram/pages/bootstrap/index.ts", "utf8")).toContain(
      "apple-reference-lv1-cutout.webp",
    );
    const navigationMarkup = readFileSync("miniprogram/components/bottom-nav/index.wxml", "utf8");
    expect(navigationMarkup).toContain('src="{{item.selected ? item.activeIcon : item.inactiveIcon}}"');
    const navigation = readFileSync("miniprogram/pages/bootstrap/index.ts", "utf8");
    expect(navigation).toContain('icon: "apple-filled"');
    expect(navigation).toContain('icon: "tree-round-dot-vertical"');
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
      { setData(value) { Object.assign(data, value); } },
      { currentTarget: { dataset: { role } } },
    );

    expect(data).toMatchObject({ loginIntent: "CREATE_TASK", loginRole: role, loginVisible: true });
    expect(sessionRuntime.accountShell).not.toHaveBeenCalled();
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
    const page = { data, setData(value: Record<string, unknown>) { Object.assign(data, value); } };
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
    const page = { data, setData(value: Record<string, unknown>) { Object.assign(data, value); } };
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
