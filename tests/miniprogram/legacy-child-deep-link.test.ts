import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../miniprogram/services/cloud-runtime.js", () => ({ cloudReady: vi.fn() }));
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("recovers unregistered child deep links without changing other missing routes", async () => {
  let application: { onPageNotFound(query: { path: string }): void } | undefined;
  vi.stubGlobal("App", (value: typeof application) => {
    application = value;
  });
  vi.stubGlobal("wx", { reLaunch: vi.fn() });
  await import("../../miniprogram/app.js");
  if (!application) throw new Error("App missing");
  application.onPageNotFound({ path: "/pages/teacher/unknown/index" });
  expect(wx.reLaunch).not.toHaveBeenCalled();
  application.onPageNotFound({ path: "pages/child/task/index" });
  application.onPageNotFound({ path: "/pages/child/submit/index" });
  expect(vi.mocked(wx.reLaunch).mock.calls).toEqual([
    [{ url: "/pages/parent/home/index?legacy=child" }],
    [{ url: "/pages/parent/home/index?legacy=child" }],
  ]);
});
