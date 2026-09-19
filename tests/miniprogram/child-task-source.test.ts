import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  command: vi.fn(),
  selectedChild: vi.fn().mockResolvedValue("child-a"),
  showError: vi.fn(),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("loads assignment and source images as the selected child and renders only authorized signed reads", async () => {
  let definition:
    | {
        data: Record<string, unknown>;
        onLoad(this: MiniPageInstance, query: { id?: string }): Promise<void>;
      }
    | undefined;
  vi.stubGlobal("Page", (page: typeof definition) => {
    definition = page;
  });
  session.command.mockImplementation(async (action, payload) => {
    if (action === "GET_ASSIGNMENT_DETAIL")
      return {
        title: "数学题图",
        category: "MATHEMATICS",
        source: "LEARNING_GROUP",
        taskState: "PENDING",
        submissionMode: "PHOTO",
        sourceAssetIds: ["private-source-a", "private-source-b"],
      };
    return { downloadUrl: `https://private.invalid/signed-${payload.assetId}` };
  });
  await import("../../miniprogram/pages/child/task/index.js");
  if (!definition) throw new Error("Page missing");
  const page = {
    ...definition,
    data: { ...definition.data },
    setData(data: object) {
      Object.assign(this.data, data);
    },
  };
  await page.onLoad({ id: "assignment-a" });
  const actor = { mode: "CHILD", childId: "child-a" };
  expect(session.command).toHaveBeenCalledWith(
    "GET_ASSIGNMENT_DETAIL",
    { assignmentId: "assignment-a" },
    actor,
  );
  expect(session.command).toHaveBeenCalledWith(
    "READ_MEDIA_ASSET",
    { assetId: "private-source-a" },
    actor,
  );
  expect(session.command).toHaveBeenCalledWith(
    "READ_MEDIA_ASSET",
    { assetId: "private-source-b" },
    actor,
  );
  expect(page.data.images).toEqual([
    "https://private.invalid/signed-private-source-a",
    "https://private.invalid/signed-private-source-b",
  ]);
  const wxml = await readFile(
    new URL("../../miniprogram/pages/child/task/index.wxml", import.meta.url),
    "utf8",
  );
  expect(wxml).toMatch(
    /<image[^>]*wx:for="\{\{images\}\}"[^>]*src="\{\{item\}\}"[^>]*mode="widthFix"/,
  );
});
