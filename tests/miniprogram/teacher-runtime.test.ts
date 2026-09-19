import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  accountShell: vi.fn(),
  command: vi.fn().mockResolvedValue({ group: { id: "group-b" } }),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
afterEach(() => vi.unstubAllGlobals());
it("keeps the group selected at request start while account refresh is pending", async () => {
  vi.resetModules();
  let stored = "group-a";
  vi.stubGlobal("wx", {
    getStorageSync: () => stored,
    setStorageSync: (_key: string, value: string) => {
      stored = value;
    },
  });
  const shell = {
    organizations: [{ id: "workspace-1", type: "TEACHER_WORKSPACE" }],
    groups: [
      { id: "group-a", organizationId: "workspace-1" },
      { id: "group-b", organizationId: "workspace-1" },
    ],
  };
  let release!: (value: typeof shell) => void;
  session.accountShell.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  session.accountShell.mockResolvedValue(shell);
  const runtime = await import("../../miniprogram/services/teacher-runtime.js");
  const pending = runtime.selectedTeacherGroup();
  await runtime.selectTeacherGroup("group-b");
  release(shell);
  expect((await pending).id).toBe("group-a");
  expect((await runtime.selectedTeacherGroup()).id).toBe("group-b");
});
it("uses the authorized selected group and rejects stale or foreign selections", async () => {
  const stored = new Map<string, unknown>();
  vi.stubGlobal("wx", {
    getStorageSync: (key: string) => stored.get(key),
    setStorageSync: (key: string, value: unknown) => stored.set(key, value),
  });
  session.accountShell.mockResolvedValue({
    organizations: [{ id: "workspace-1", type: "TEACHER_WORKSPACE" }],
    groups: [
      { id: "group-a", name: "A", organizationId: "workspace-1" },
      { id: "group-b", name: "B", organizationId: "workspace-1" },
    ],
  });
  const runtime = await import("../../miniprogram/services/teacher-runtime.js");
  await runtime.selectTeacherGroup("group-b");
  await runtime.teacherWorkspace();
  expect(session.command).toHaveBeenCalledWith("GET_GROUP_WORKSPACE", { groupId: "group-b" });
  await expect(runtime.selectTeacherGroup("rental-group")).rejects.toThrow();
  session.accountShell.mockResolvedValue({ organizations: [], groups: [] });
  await expect(runtime.selectedTeacherGroup()).rejects.toThrow();
});

it("does not silently publish to another group when the selected group was removed", async () => {
  vi.resetModules();
  vi.stubGlobal("wx", { getStorageSync: () => "removed-group" });
  session.accountShell.mockResolvedValue({
    organizations: [{ id: "workspace-1", type: "TEACHER_WORKSPACE" }],
    groups: [{ id: "different-group", organizationId: "workspace-1" }],
  });
  const runtime = await import("../../miniprogram/services/teacher-runtime.js");
  await expect(runtime.selectedTeacherGroup()).rejects.toThrow();
});
