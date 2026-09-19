import { afterEach, beforeEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  selectedChild: vi.fn(async () => "child-a"),
  selectChild: vi.fn(async (id: string) => {
    session.selectedChild.mockResolvedValue(id);
  }),
  dashboard: async () => {
    const children = [
      { id: "child-a", nickname: "甲" },
      { id: "child-b", nickname: "乙" },
    ];
    const childId = await session.selectedChild();
    return {
      children,
      selectedChild: children.find((child) => child.id === childId),
      selectionRequired: false,
    };
  },
  selectedFamily: vi.fn(async () => ({
    children: [
      { id: "child-a", nickname: "甲" },
      { id: "child-b", nickname: "乙" },
    ],
  })),
  showError: vi.fn(),
  command: vi.fn(async (action: string) => {
    if (action === "GET_CHILD_GROUPS") return { memberships: [], pending: [] };
    if (action === "PREVIEW_GROUP_INVITATION")
      return {
        groupName: "二年级一班",
        organizationName: "春风小学",
        expiresAt: "2030-01-01T00:00:00.000Z",
      };
    if (action === "CLAIM_INVITATION") return { id: "join-b", status: "PENDING_APPROVAL" };
    throw new Error(`Unexpected ${action}`);
  }),
}));

vi.mock("../../miniprogram/services/session-runtime.js", () => session);
const runtime = vi.hoisted(() => ({
  navigate: vi.fn(),
  coreApiClient: {
    execute: async (action: string, _payload: object) => ({
      ok: true,
      data: await session.command(action),
    }),
  },
}));
vi.mock("../../miniprogram/services/page-runtime.js", () => runtime);

beforeEach(() => {
  vi.resetModules();
  session.command.mockClear();
  session.selectedFamily.mockClear();
  session.selectedChild.mockResolvedValue("child-a");
  runtime.navigate.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

type InvitationDefinition = {
  data: Record<string, unknown>;
  onLoad(this: MiniPageInstance, query: { code?: string; childId?: string }): Promise<void>;
  confirmJoin(this: MiniPageInstance): Promise<void>;
};

async function loadInvitationPage() {
  let definition: InvitationDefinition | undefined;
  vi.stubGlobal("Page", (value: InvitationDefinition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn(), redirectTo: vi.fn() });
  await import("../../miniprogram/pages/shared/invitation/index.js");
  if (!definition) throw new Error("Page not registered");
  return {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
}

type GroupsDefinition = {
  data: Record<string, unknown>;
  onShow(this: MiniPageInstance): Promise<void>;
  chooseInvitationChild(
    this: MiniPageInstance,
    event: { currentTarget: { dataset: { childId?: string } } },
  ): Promise<void>;
  openInvitation(this: MiniPageInstance): Promise<void>;
};

async function loadGroupsPage() {
  let definition: GroupsDefinition | undefined;
  vi.stubGlobal("Page", (value: GroupsDefinition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn() });
  await import("../../miniprogram/pages/parent/groups/index.js");
  if (!definition) throw new Error("Page not registered");
  return {
    ...definition,
    data: { ...definition.data },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
}

it("requires selecting a family child before opening an invitation", async () => {
  const page = await loadGroupsPage();
  await page.onShow();
  expect(page.data).toMatchObject({
    invitationChildren: [
      { id: "child-a", nickname: "甲" },
      { id: "child-b", nickname: "乙" },
    ],
  });
  await page.openInvitation();
  expect(runtime.navigate).not.toHaveBeenCalled();
  await page.chooseInvitationChild({ currentTarget: { dataset: { childId: "child-b" } } });
  await page.openInvitation();
  expect(runtime.navigate).toHaveBeenCalledWith("/pages/shared/invitation/index?childId=child-b");
});

it("claims an invitation for the child selected in the route, not the global child", async () => {
  const page = await loadInvitationPage();
  await page.onLoad({ childId: "child-b", code: "join-code" });
  expect(page.data).toMatchObject({ expiresAt: "2030-01-01T00:00:00.000Z" });
  expect(session.command).toHaveBeenCalledWith("PREVIEW_GROUP_INVITATION", {
    childId: "child-b",
    code: "join-code",
  });
  page.setData({ consent: true });
  await page.confirmJoin();

  expect(session.command).toHaveBeenCalledWith(
    "CLAIM_INVITATION",
    expect.objectContaining({ childId: "child-b", code: "join-code" }),
  );
  expect(session.command).not.toHaveBeenCalledWith(
    "CLAIM_INVITATION",
    expect.objectContaining({ childId: "child-a" }),
  );
});

it.each([undefined, "child-not-in-family"])(
  "does not preview or claim without a valid parent child route (%s)",
  async (childId) => {
    const page = await loadInvitationPage();
    await page.onLoad(childId ? { childId, code: "join-code" } : { code: "join-code" });

    expect(page.data).toMatchObject({ ready: false, childValid: false });
    expect(session.command).not.toHaveBeenCalledWith("PREVIEW_GROUP_INVITATION", expect.anything());
    page.setData({ consent: true, ready: true });
    await page.confirmJoin();
    expect(session.command).not.toHaveBeenCalledWith("CLAIM_INVITATION", expect.anything());
  },
);

it("does not allow a child-mode style route without a parent child selection", async () => {
  const page = await loadInvitationPage();
  await page.onLoad({ code: "join-code" });
  expect(page.data).toMatchObject({ childValid: false, ready: false });
});

it("does not submit an expired invitation after preview rejects it", async () => {
  session.command.mockImplementationOnce(async (action: string) => {
    if (action === "PREVIEW_GROUP_INVITATION") throw new Error("邀请码已过期");
    throw new Error(`Unexpected ${action}`);
  });
  const page = await loadInvitationPage();
  await page.onLoad({ childId: "child-b", code: "expired-code" });
  expect(page.data).toMatchObject({ childValid: true, ready: false, error: "邀请码已过期" });
  await page.confirmJoin();
  expect(session.command).not.toHaveBeenCalledWith("CLAIM_INVITATION", expect.anything());
});
