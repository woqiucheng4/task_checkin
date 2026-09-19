import { afterEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  selectedChild: async () => "child-current",
  dashboard: vi.fn().mockRejectedValue(new Error("网络不可用")),
  showError: vi.fn(),
}));
const runtime = vi.hoisted(() => ({
  navigate: vi.fn(),
  replace: vi.fn(),
  coreApiClient: { execute: vi.fn() },
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => runtime);
afterEach(() => vi.unstubAllGlobals());

it("never displays invented harvests or enables parent planting when loading fails", async () => {
  type Definition = {
    data: Record<string, unknown>;
    onShow(this: MiniPageInstance): Promise<void>;
    startNext(
      this: MiniPageInstance,
      event: { currentTarget: { dataset: { catalogId: string } } },
    ): Promise<void>;
  };
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn() });
  await import("../../miniprogram/pages/parent/orchard/index.js");
  if (!definition) throw new Error("Page not registered");
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
  expect(page.data.current).toBe(0);
  expect(page.data.progressPercent).toBe(0);
  expect(page.data.growthCards).toEqual([]);
  await page.onShow();
  expect(page.data).toMatchObject({ loading: false, ready: false });
  await page.startNext({ currentTarget: { dataset: { catalogId: "starter-apple" } } });
  expect(runtime.coreApiClient.execute).not.toHaveBeenCalled();
});
