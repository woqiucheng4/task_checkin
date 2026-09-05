import { describe, expect, it, vi } from "vitest";
import { ChildController } from "../../miniprogram/controllers/child-controller.js";
import { childFixtures } from "../../miniprogram/presentation/fixtures.js";
import { buildChildTodayPage } from "../../miniprogram/presentation/page-models.js";

describe("孩子端完整状态", () => {
  it.each(["loading", "empty", "ready", "offline", "error"] as const)(
    "呈现今日页 %s 状态",
    (state) => {
      expect(buildChildTodayPage(childFixtures[state]).screenState).toBe(state);
    },
  );

  it("提交所选模式后提示阳光已保护", async () => {
    const execute = vi.fn().mockResolvedValue({ data: { submissionId: "submission-1" }, ok: true });
    const controller = new ChildController({ execute });

    await controller.submit({
      assignmentId: "assignment-1",
      mediaAssetIds: ["media-1"],
      mode: "PHOTO",
    });

    expect(execute).toHaveBeenCalledWith(
      "SUBMIT_TASK",
      expect.objectContaining({ assignmentId: "assignment-1", mediaAssetIds: ["media-1"] }),
    );
    expect(controller.current().notice).toBe("已提交，阳光已保护");
  });

  it("失败时保留可恢复提示", async () => {
    const execute = vi.fn().mockResolvedValue({
      error: { code: "TEMPORARY_UNAVAILABLE", message: "网络开小差了" },
      ok: false,
    });
    const controller = new ChildController({ execute });

    await controller.harvest("tree-1");

    expect(controller.current()).toMatchObject({
      notice: "网络开小差了",
      status: "error",
    });
  });
});
