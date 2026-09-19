import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoreApi } from "../../src/application/core-api.js";
import { createIdentityScenario } from "../helpers/identity-scenario.js";

const cloud = vi.hoisted(() => ({ callFunction: vi.fn() }));
vi.mock("../../miniprogram/services/cloud-runtime.js", () => ({
  cloudReady: async () => cloud,
}));

type Definition = {
  data: Record<string, unknown>;
  onShow(this: MiniPageInstance): Promise<void>;
  navigateTab(this: MiniPageInstance, event: { detail: { path: string } }): void;
  editChildNickname(this: MiniPageInstance, event: { detail: { value: string } }): void;
  addChild(this: MiniPageInstance): Promise<void>;
  selectChild(
    this: MiniPageInstance,
    event: { currentTarget: { dataset: { id: string } } },
  ): Promise<void>;
};

async function loadPage(name: "home" | "profile") {
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  await import(`../../miniprogram/pages/parent/${name}/index.ts`);
  if (!definition) throw new Error("Missing page definition");
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const storage = new Map<string, unknown>();
  vi.stubGlobal("wx", {
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    showToast: vi.fn(),
    redirectTo: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("reachable existing-family add-child flow", () => {
  it("reuses its creation request after a successful response is lost", async () => {
    const seed = await createIdentityScenario(1);
    const api = createCoreApi(seed.harness);
    let discardFirstCreateResponse = true;
    cloud.callFunction.mockImplementation(async ({ data }) => {
      const result = await api.handle(data, { openId: "wx-scenario-guardian" });
      if (data.action === "ADD_CHILD" && discardFirstCreateResponse) {
        discardFirstCreateResponse = false;
        throw new Error("创建响应丢失");
      }
      return { result };
    });
    const profile = await loadPage("profile");
    await profile.onShow();
    profile.editChildNickname({ detail: { value: "第二个孩子" } });

    await profile.addChild();
    await profile.addChild();

    const children = await seed.harness.repository.query("children");
    expect(children).toHaveLength(2);
    const creates = cloud.callFunction.mock.calls.filter(
      ([request]) => request.data.action === "ADD_CHILD",
    );
    expect(creates).toHaveLength(2);
    expect(creates[0]?.[0].data.requestId).toBe(creates[1]?.[0].data.requestId);
  });

  it.each([false, true])(
    "adds child two through the profile and selects it from refreshed home (refresh retry: %s)",
    async (failRefresh) => {
      const seed = await createIdentityScenario(1);
      const api = createCoreApi(seed.harness);
      let failNextShell = false;
      cloud.callFunction.mockImplementation(async ({ data }) => {
        if (data.action === "GET_ACCOUNT_SHELL" && failNextShell) {
          failNextShell = false;
          throw new Error("刷新连接失败");
        }
        const result = await api.handle(data, { openId: "wx-scenario-guardian" });
        if (failRefresh && data.action === "ADD_CHILD") failNextShell = true;
        return { result };
      });
      const originalAccounts = await seed.harness.repository.query("accounts");
      const home = await loadPage("home");
      await home.onShow();
      expect(home.data.children).toHaveLength(1);
      expect(home.data.navigation).toContainEqual(
        expect.objectContaining({
          key: "profile",
          path: "/pages/parent/profile/index",
        }),
      );
      home.navigateTab({ detail: { path: "/pages/parent/profile/index" } });
      expect(wx.redirectTo).toHaveBeenCalledWith({ url: "/pages/parent/profile/index" });
      const profile = await loadPage("profile");
      await profile.onShow();
      expect(profile.data).toMatchObject({ familyId: seed.family.id, childCount: 1 });
      const markup = readFileSync("miniprogram/pages/parent/profile/index.wxml", "utf8");
      expect(markup).toContain('bindinput="editChildNickname"');
      expect(markup).toContain('bindtap="addChild"');
      profile.editChildNickname({ detail: { value: " 第二个孩子 " } });
      await profile.addChild();
      if (failRefresh) {
        expect(profile.data).toMatchObject({
          childNotice: "孩子已添加，刷新后即可在首页选择",
          addingChild: false,
        });
        await profile.addChild();
      }
      expect(wx.redirectTo).toHaveBeenLastCalledWith({ url: "/pages/parent/home/index" });
      const children = await seed.harness.repository.query("children");
      expect(children).toHaveLength(2);
      const added = children.find((child) => child.id !== seed.firstChild.id)!;
      expect(added.nickname).toBe("第二个孩子");
      expect(await seed.harness.repository.query("accounts")).toEqual(originalAccounts);
      expect(
        await seed.harness.repository.query("guardianLinks", { childId: added.id }),
      ).toMatchObject([
        { accountId: seed.guardian.accountId, familyId: seed.family.id, status: "ACTIVE" },
      ]);
      expect(
        cloud.callFunction.mock.calls.filter(([request]) => request.data.action === "ADD_CHILD"),
      ).toHaveLength(1);
      expect(cloud.callFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "ADD_CHILD",
            payload: { familyId: seed.family.id, nickname: "第二个孩子" },
          }),
        }),
      );
      await home.onShow();
      expect(home.data.children).toHaveLength(2);
      expect(home.data.selectedChildId).toBe(seed.firstChild.id);
      await home.selectChild({ currentTarget: { dataset: { id: added.id } } });
      expect(home.data).toMatchObject({
        selectedChildId: added.id,
        selectedName: "第二个孩子",
        selectionRequired: false,
      });
      expect(cloud.callFunction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "GET_PARENT_DASHBOARD",
            actor: { mode: "ACCOUNT" },
            payload: expect.objectContaining({ childId: added.id }),
          }),
        }),
      );
    },
  );
});
