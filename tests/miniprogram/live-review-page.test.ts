import { afterEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  command: vi.fn(),
  showError: vi.fn(),
  taskDetail: vi
    .fn()
    .mockResolvedValue({ title: "草稿标题", taskState: "PENDING", source: "FAMILY" }),
}));
vi.mock("../../miniprogram/services/session-runtime.js", () => session);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it.each([
  ["parent", "FAMILY", true],
  ["parent", "LEARNING_GROUP", false],
  ["teacher", "LEARNING_GROUP", true],
] as const)(
  "shows the server-authorized child identity in the %s review for %s tasks",
  async (role, source, canReview) => {
    type Definition = {
      data: Record<string, unknown>;
      onLoad(this: MiniPageInstance, query: { id: string }): Promise<void>;
    };
    let definition: Definition | undefined;
    vi.stubGlobal("Page", (value: Definition) => {
      definition = value;
    });
    session.command.mockImplementation(async (action: string) =>
      action === "GET_ASSIGNMENT_DETAIL"
        ? {
            title: "已提交任务",
            childLabel: "审核对象小新",
            source,
            taskState: "SUBMITTED",
            academicState: source === "FAMILY" ? "NOT_REQUIRED" : "PENDING",
            rewardState: "PROTECTED",
            submission: { text: "真实完成说明", mediaAssetIds: ["media-own"] },
          }
        : { downloadUrl: "https://storage.example/signed-photo" },
    );
    if (role === "parent") await import("../../miniprogram/pages/parent/review-detail/index.js");
    else await import("../../miniprogram/pages/teacher/review-detail/index.js");
    if (!definition) throw new Error("Page not registered");
    const page = {
      ...definition,
      data: { ...definition.data },
      setData(value: object) {
        Object.assign(this.data, value);
      },
    };
    await page.onLoad({ id: "assignment-own" });
    expect(page.data).toMatchObject({
      title: "已提交任务",
      childLabel: "审核对象小新",
      submissionText: "真实完成说明",
      images: ["https://storage.example/signed-photo"],
      canReview,
    });
  },
);
