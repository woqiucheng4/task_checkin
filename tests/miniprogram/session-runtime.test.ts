import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../miniprogram/services/core-api.js", () => ({
  CoreApiClient: class {
    execute = bridge.execute;
  },
  AccountChildApiClient: class {
    execute = bridge.execute;
  },
}));
vi.mock("../../miniprogram/services/cloud-runtime.js", () => ({ cloudReady: vi.fn() }));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("parent child session runtime", () => {
  it("keeps no selection when bootstrap has no children", async () => {
    stubShell([]);
    const runtime = await import("../../miniprogram/services/session-runtime.js");

    await runtime.accountShell();

    await expect(runtime.selectedChild()).rejects.toThrow("请先添加孩子");
  });

  it("selects the only linked child", async () => {
    stubShell([{ id: "family-1", children: [{ id: "child-1" }] }]);
    const runtime = await import("../../miniprogram/services/session-runtime.js");

    await runtime.accountShell();

    await expect(runtime.selectedChild()).resolves.toBe("child-1");
  });

  it("does not silently choose the first child when multiple children have no preference", async () => {
    stubShell([{ id: "family-1", children: [{ id: "child-1" }, { id: "child-2" }] }]);
    const runtime = await import("../../miniprogram/services/session-runtime.js");

    await runtime.accountShell();

    await expect(runtime.selectedChild()).rejects.toThrow("请选择孩子");
  });

  it("returns account children for the selection UI without requesting a child dashboard", async () => {
    stubShell([
      {
        id: "family-1",
        name: "家庭",
        children: [
          { id: "child-1", nickname: "小明" },
          { id: "child-2", nickname: "小红" },
        ],
      },
    ]);
    const runtime = await import("../../miniprogram/services/session-runtime.js");

    const view = await runtime.dashboard();

    expect(view).toMatchObject({
      selectionRequired: true,
      children: [
        { id: "child-1", nickname: "小明", selected: false },
        { id: "child-2", nickname: "小红", selected: false },
      ],
    });
    expect(bridge.execute).not.toHaveBeenCalledWith(
      "GET_PARENT_DASHBOARD",
      expect.anything(),
      expect.anything(),
    );
  });

  it("replaces a persisted stale child with the only linked child on refresh", async () => {
    let families = [{ id: "family-1", children: [{ id: "child-1" }] }];
    stubShell(() => families);
    let storage = { selectedChildId: "child-1" } as { selectedChildId?: string };
    vi.stubGlobal("wx", {
      getStorageSync: () => storage,
      setStorageSync: vi.fn(
        (_key: string, value: { selectedChildId?: string }) => (storage = structuredClone(value)),
      ),
    });
    const runtime = await import("../../miniprogram/services/session-runtime.js");

    await runtime.accountShell();
    families = [{ id: "family-1", children: [{ id: "child-2" }] }];
    await runtime.accountShell(true);

    expect(storage).toEqual({ selectedChildId: "child-2" });
    await expect(runtime.selectedChild()).resolves.toBe("child-2");
  });

  it("switches a valid child and clears it after a refreshed shell removes the link", async () => {
    let families = [{ id: "family-1", children: [{ id: "child-1" }, { id: "child-2" }] }];
    stubShell(() => families);
    let storage = { selectedChildId: "child-1" } as { selectedChildId?: string };
    vi.stubGlobal("wx", {
      getStorageSync: () => storage,
      setStorageSync: vi.fn(
        (_key: string, value: { selectedChildId?: string }) => (storage = structuredClone(value)),
      ),
    });
    const runtime = await import("../../miniprogram/services/session-runtime.js");

    await runtime.accountShell();
    await runtime.selectChild("child-2");
    expect(await runtime.selectedChild()).toBe("child-2");

    families = [{ id: "family-1", children: [{ id: "child-1" }, { id: "child-3" }] }];
    await runtime.accountShell(true);

    await expect(runtime.selectedChild()).rejects.toThrow("请选择孩子");
  });
});

function stubShell(families: readonly unknown[] | (() => readonly unknown[])) {
  vi.stubGlobal("wx", {
    getStorageSync: () => undefined,
    setStorageSync: vi.fn(),
  });
  bridge.execute.mockImplementation(async (action: string) => ({
    ok: true,
    data:
      action === "GET_ACCOUNT_SHELL"
        ? {
            families: typeof families === "function" ? families() : families,
            groups: [],
            organizations: [],
          }
        : {},
  }));
}
