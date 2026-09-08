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
    groups: [
      { id: "group-a", name: "A" },
      { id: "group-b", name: "B" },
    ],
  });
  const runtime = await import("../../miniprogram/services/teacher-runtime.js");
  await runtime.selectTeacherGroup("group-b");
  await runtime.teacherWorkspace();
  expect(session.command).toHaveBeenCalledWith("GET_GROUP_WORKSPACE", { groupId: "group-b" });
  await expect(runtime.selectTeacherGroup("rental-group")).rejects.toThrow();
  session.accountShell.mockResolvedValue({ groups: [] });
  await expect(runtime.selectedTeacherGroup()).rejects.toThrow();
});
