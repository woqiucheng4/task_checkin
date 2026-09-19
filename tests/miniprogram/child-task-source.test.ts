import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});
it.each(["today", "task", "submit", "orchard", "profile", "group"])(
  "safely redirects legacy child %s without loading a session or issuing a request",
  async (route) => {
    let definition: { onShow(): void } | undefined;
    vi.stubGlobal("Page", (page: typeof definition) => {
      definition = page;
    });
    vi.stubGlobal("wx", { redirectTo: vi.fn() });
    await import(`../../miniprogram/pages/child/${route}/index.ts`);
    if (!definition) throw new Error("Page missing");
    definition.onShow();
    expect(wx.redirectTo).toHaveBeenCalledWith({ url: "/pages/parent/home/index?legacy=child" });
    const source = readFileSync(`miniprogram/pages/child/${route}/index.ts`, "utf8");
    expect(source).not.toMatch(/session-runtime|childClient|mode:.*CHILD|execute\(/);
  },
);
