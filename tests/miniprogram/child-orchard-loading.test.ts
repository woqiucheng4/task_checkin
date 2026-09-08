import { afterEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  selectedChild: async () => "child-current",
  command: vi.fn().mockRejectedValue(new Error("网络不可用")),
  dashboard: vi.fn(),
  showError: vi.fn(),
  childClient: { execute: vi.fn() },
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => ({
  navigate: vi.fn(),
  replace: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

it("never displays invented harvests or enables planting when loading fails", async () => {
  type Definition = {
    data: Record<string, unknown>;
    onShow(this: MiniPageInstance): Promise<void>;
    startNext(
      this: MiniPageInstance,
      event: { currentTarget: { dataset: { fruit: string; name: string } } },
    ): Promise<void>;
  };
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn() });
  await import("../../miniprogram/pages/child/orchard/index.js");
  if (!definition) throw new Error("Page not registered");
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
  expect(page.data.current).toBe(0);
  expect(page.data.progress).toBe(0);
  expect((page.data.collection as { count: number }[]).every((item) => item.count === 0)).toBe(
    true,
  );
  expect((page.data.stages as { done: boolean }[]).some((item) => item.done)).toBe(false);
  await page.onShow();
  expect(page.data).toMatchObject({ loading: false, ready: false, selecting: false });
  await page.startNext({ currentTarget: { dataset: { fruit: "apple", name: "苹果树" } } });
  expect(session.childClient.execute).not.toHaveBeenCalled();
});
