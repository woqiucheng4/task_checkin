import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  accountShell: vi.fn(),
  command: vi.fn().mockResolvedValue({ group: { id: "group-b" } }),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
afterEach(() => vi.unstubAllGlobals());
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
