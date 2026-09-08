import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  selectedChild: async () => "child-real",
  selectedFamily: async () => ({ children: [{ id: "child-real", nickname: "小新" }] }),
  dashboard: async () => ({ groups: [{ id: "group-real", name: "真实班级" }] }),
  showError: vi.fn(),
  command: vi.fn(async (action: string) => {
    if (action === "GET_CHILD_GROUPS")
      return {
        memberships: [
          {
            id: "membership-real",
            groupId: "group-real",
            name: "真实班级",
            organizationName: "真实学校",
            type: "SCHOOL",
            status: "ACTIVE",
            disclosure: { displayName: true, grade: false, avatar: false },
          },
        ],
        pending: [],
      };
    if (action === "GET_GROUP_PROGRESS") return { progress: 7, threshold: 18, status: "GROWING" };
    if (action === "PREVIEW_GROUP_INVITATION")
      return { groupName: "真实班级", organizationName: "真实学校" };
    if (action === "CLAIM_INVITATION") return { id: "join-real", status: "PENDING_APPROVAL" };
    if (action === "WITHDRAW_CHILD") return {};
    throw new Error(`Unexpected ${action}`);
  }),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => ({
  navigate: vi.fn(),
  coreApiClient: { execute: async () => ({ ok: true, data: {} }) },
}));
afterEach(() => vi.unstubAllGlobals());
type Definition = {
  data: Record<string, unknown>;
  onShow(this: MiniPageInstance): Promise<void>;
  onLoad(this: MiniPageInstance, query: { code: string }): Promise<void>;
  confirmJoin(this: MiniPageInstance): Promise<void>;
  requestWithdraw(
    this: MiniPageInstance,
    event: { currentTarget: { dataset: { id: string; name: string } } },
  ): void;
  confirmWithdraw(this: MiniPageInstance): Promise<void>;
};
async function loadPage(path: string) {
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn(), redirectTo: vi.fn() });
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
it("withdraws the selected real membership instead of a fixed ID", async () => {
  const page = await loadPage("../../miniprogram/pages/parent/groups/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({ groups: [{ id: "membership-real", name: "真实班级" }] });
  page.requestWithdraw({ currentTarget: { dataset: { id: "membership-real", name: "真实班级" } } });
  await page.confirmWithdraw();
  expect(session.command).toHaveBeenCalledWith("WITHDRAW_CHILD", {
    childGroupMembershipId: "membership-real",
  });
});
it("shows real shared progress without invented personal contribution", async () => {
  const page = await loadPage("../../miniprogram/pages/child/group/index.js");
  await page.onShow();
  expect(page.data).toMatchObject({
    groups: [{ id: "group-real", name: "真实班级", current: 7, target: 18 }],
  });
});
it("requires explicit consent after a real invitation preview", async () => {
  const page = await loadPage("../../miniprogram/pages/shared/invitation/index.js");
  await page.onLoad({ code: "real-code" });
  expect(page.data).toMatchObject({
    groupName: "真实班级",
    organizationName: "真实学校",
    consent: false,
  });
  session.command.mockClear();
  await page.confirmJoin();
  expect(session.command).not.toHaveBeenCalled();
  page.setData({ consent: true });
  await page.confirmJoin();
  expect(session.command).toHaveBeenCalledWith("CLAIM_INVITATION", {
    childId: "child-real",
    code: "real-code",
    disclosure: { avatar: false, displayName: true, grade: true },
  });
});
