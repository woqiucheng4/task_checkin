import { afterEach, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../miniprogram/services/core-api.js", () => ({
  CoreApiClient: class {
    execute = bridge.execute;
  },
}));
vi.mock("../../miniprogram/services/cloud-runtime.js", () => ({ cloudReady: vi.fn() }));
afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("freezes both child and family before an already queued selection switch resolves", async () => {
  const families = [
    { id: "family-a", children: [{ id: "child-a" }] },
    { id: "family-b", children: [{ id: "child-b" }] },
  ];
  vi.stubGlobal("wx", { getStorageSync: () => ({ childId: "child-a" }), setStorageSync: vi.fn() });
  bridge.execute.mockImplementation(async (action: string) => ({
    ok: true,
    data: action === "GET_ACCOUNT_SHELL" ? { families } : {},
  }));
  const runtime = await import("../../miniprogram/services/session-runtime.js");
  await runtime.accountShell();
  const switching = runtime.selectChild("child-b");
  const child = runtime.selectedChild();
  const family = runtime.selectedFamily();
  await switching;
  expect(await child).toBe("child-a");
  expect((await family).id).toBe("family-a");
  expect(await runtime.selectedChild()).toBe("child-b");
});
