import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

type ShellDefinition = {
  methods: {
    backToBootstrap(): void;
  };
};

type BootstrapDefinition = {
  data: Record<string, unknown>;
  cancelSetup(this: { setData(value: Record<string, unknown>): void }): void;
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
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
});
