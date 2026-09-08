import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  command: vi.fn(),
  selectedChild: vi.fn().mockResolvedValue("child-real"),
  selectedFamily: vi.fn().mockResolvedValue({ children: [{ id: "child-real", nickname: "小新" }] }),
  showError: vi.fn(),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
vi.mock("../../miniprogram/services/page-runtime.js", () => ({
  coreApiClient: { execute: async () => ({ ok: true, data: { id: "wish-real" } }) },
}));
afterEach(() => vi.unstubAllGlobals());
it("creates a wish for the selected real child then refreshes persisted wishes", async () => {
  type Definition = {
    data: Record<string, unknown>;
    createWish(this: MiniPageInstance): Promise<void>;
  };
  let definition: Definition | undefined;
  vi.stubGlobal("Page", (value: Definition) => {
    definition = value;
  });
  vi.stubGlobal("wx", { showToast: vi.fn() });
  session.command.mockImplementation(async (action: string) =>
    action === "GET_FAMILY_WISHES"
      ? {
          wishes: [{ id: "wish-real", title: "一起散步", status: "ACTIVE" }],
          links: [],
          fruits: [],
        }
      : { id: "wish-real" },
  );
  await import("../../miniprogram/pages/parent/wishes/index.js");
  if (!definition) throw new Error("Page not registered");
  const page = {
    ...definition,
    data: { ...definition.data, title: "一起散步" },
    setData(value: object) {
      Object.assign(this.data, value);
    },
  };
  await page.createWish();
  expect(session.command).toHaveBeenCalledWith("CREATE_WISH", {
    childId: "child-real",
    title: "一起散步",
  });
  expect(page.data).toMatchObject({
    wishes: [{ id: "wish-real", title: "一起散步" }],
    creating: false,
    title: "",
  });
});
