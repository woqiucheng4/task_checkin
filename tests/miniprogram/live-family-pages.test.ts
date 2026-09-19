import { afterEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  selectedChild: async () => "child-real",
  selectedFamily: async () => ({
    id: "family-real",
    name: "真实家庭",
    children: [{ id: "child-real", nickname: "小新", grade: 2 }],
  }),
  dashboard: async () => ({
    children: [{ id: "child-real", nickname: "小新", grade: 2 }],
    selectionRequired: false,
    selectedChild: { id: "child-real", nickname: "小新", grade: 2 },
    family: { id: "family-real", name: "真实家庭" },
    groups: [],
    currentTree: { name: "小苹果", progress: 4, threshold: 6, status: "GROWING", stage: "幼果" },
  }),
  command: vi.fn(async (action: string) => {
    if (action === "GET_CHILD_ORCHARD")
      return {
        currentTree: { id: "tree-real", progress: 4, status: "GROWING" },
        lifetimeSunlight: 4,
        fruits: [{ catalogId: "starter-apple", quantity: 2 }],
        growthCards: [
          { id: "card-real", title: "第一次收获", harvestedAt: "2026-09-06T10:00:00Z" },
        ],
      };
    if (action === "GET_FAMILY_SETTINGS")
      return {
        id: "family-real",
        name: "真实家庭",
        role: "FAMILY_ADMIN",
        childCount: 1,
        members: [{ id: "member-real", role: "FAMILY_ADMIN", isSelf: true }],
        defaultRewards: { ordinary: 2, focus: 3, challenge: 1, revision: 1 },
      };
    throw new Error(`Unexpected action ${action}`);
  }),
  showError: vi.fn(),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => ({
  navigate: vi.fn(),
  replace: vi.fn(),
  coreApiClient: {
    execute: async (action: string) => ({ ok: true, data: await session.command(action) }),
  },
}));
afterEach(() => vi.unstubAllGlobals());
type Definition = {
  data: Record<string, unknown>;
  onShow(this: MiniPageInstance): Promise<void>;
};
async function loadPage(path: string) {
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", {
    showToast: vi.fn(),
    redirectTo: vi.fn(),
    getStorageSync: () => undefined,
    setStorageSync: vi.fn(),
  });
  await import(path);
  if (!definition) throw new Error("Page not registered");
  return {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
}
it("shows real orchard progress and harvest history in the parent orchard", async () => {
  const page = await loadPage("../../miniprogram/pages/parent/orchard/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({
    child: "小新",
    treeName: "小苹果",
    current: 4,
    target: 6,
    lifetimeSunlight: 4,
    growthCards: [{ id: "card-real", title: "第一次收获" }],
  });
});
it("loads family settings without exposing an export action", async () => {
  const page = await loadPage("../../miniprogram/pages/parent/profile/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({
    familyName: "真实家庭",
    childCount: 1,
    memberCount: 1,
    rewards: { ordinary: 2, focus: 3, challenge: 1, revision: 1 },
  });
  expect(session.command).not.toHaveBeenCalledWith("REQUEST_EXPORT", expect.anything());
});
it("redirects the old child profile to the parent selector", async () => {
  const page = await loadPage("../../miniprogram/pages/child/profile/index.js");
  await page.onShow();
  expect(wx.redirectTo).toHaveBeenCalledWith({ url: "/pages/parent/home/index?legacy=child" });
});
