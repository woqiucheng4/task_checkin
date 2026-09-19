import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const sessionRuntime = vi.hoisted(() => ({
  accountShell: vi.fn(),
  command: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("../../miniprogram/services/session-runtime.js", () => ({
  accountShell: sessionRuntime.accountShell,
  command: sessionRuntime.command,
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
  chooseRole(
    this: { data: Record<string, unknown>; setData(value: Record<string, unknown>): void },
    event: { readonly currentTarget: { readonly dataset: { readonly role?: string } } },
  ): Promise<void>;
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

  it.each([
    ["parent", "/pages/parent/home/index", []],
    ["teacher", "/pages/teacher/home/index", [{ type: "TEACHER_WORKSPACE" }]],
  ] as const)(
    "选择 %s 时只高亮该入口，跳转后恢复默认样式",
    async (role, destination, organizations) => {
      let definition: BootstrapDefinition | undefined;
      const redirectTo = vi.fn();
      vi.stubGlobal("Page", (value: BootstrapDefinition) => {
        definition = value;
      });
      vi.stubGlobal("wx", { redirectTo });

      let resolveShell:
        | ((value: {
            families: Array<{ children: Array<{ id: string }> }>;
            organizations: ReadonlyArray<{ type: string }>;
          }) => void)
        | undefined;
      sessionRuntime.accountShell.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveShell = resolve;
          }),
      );

      await import("../../miniprogram/pages/bootstrap/index.js");
      if (!definition) throw new Error("bootstrap page not registered");
      const data = { ...definition.data };
      const page = {
        data,
        setData(value: Record<string, unknown>) {
          Object.assign(data, value);
        },
      };

      const navigation = definition.chooseRole.call(page, {
        currentTarget: { dataset: { role } },
      });

      expect(data).toMatchObject({ activeRole: role, loading: true });

      resolveShell?.({ families: [{ children: [{ id: "child-1" }] }], organizations });
      await navigation;

      expect(redirectTo).toHaveBeenCalledWith({ url: destination });
      expect(data).toMatchObject({ activeRole: "", loading: false });
    },
  );

  it("将没有孩子的家长带入可恢复的家庭创建状态", async () => {
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
    await definition.chooseRole.call(
      {
        data,
        setData(value) {
          Object.assign(data, value);
        },
      },
      { currentTarget: { dataset: { role: "parent" } } },
    );

    expect(data).toMatchObject({
      setup: true,
      familyId: "family-1",
      activeRole: "",
      loading: false,
    });
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it("将尚未激活工作区的教师带入既有激活流程", async () => {
    let definition: BootstrapDefinition | undefined;
    const redirectTo = vi.fn();
    vi.stubGlobal("Page", (value: BootstrapDefinition) => {
      definition = value;
    });
    vi.stubGlobal("wx", { redirectTo });
    sessionRuntime.accountShell.mockResolvedValueOnce({ families: [], organizations: [] });

    await import("../../miniprogram/pages/bootstrap/index.js");
    if (!definition) throw new Error("bootstrap page not registered");
    await definition.chooseRole.call(
      { data: { ...definition.data }, setData: vi.fn() },
      { currentTarget: { dataset: { role: "teacher" } } },
    );

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
