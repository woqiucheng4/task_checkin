import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ChildController } from "../../miniprogram/controllers/child-controller.js";
import { childFixtures } from "../../miniprogram/presentation/fixtures.js";
import {
  buildChildTodayPage,
  buildTaskRow,
  resolveChildTreeAsset,
} from "../../miniprogram/presentation/page-models.js";

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

  it("将家庭自理任务渲染为首页中的房屋图标", () => {
    const [familyTask] = childFixtures.ready.tasks;
    if (familyTask === undefined) throw new Error("家庭任务夹具缺失");
    const row = buildTaskRow(familyTask);

    expect(row.icon).toBe("home");
  });

  it("今日首页保留截图中的小树成长指南", () => {
    const markup = readFileSync("miniprogram/pages/child/today/index.wxml", "utf8");
    const styles = readFileSync("miniprogram/components/orchard-hero/index.wxss", "utf8");

    expect(markup).toContain("小树成长指南");
    expect(markup).toContain("embedded-sign");
    expect(styles).toContain("width: 378rpx;");
    expect(styles).toContain("height: 501rpx;");
  });

  it("按阳光进度切换果树成长图，并让参考稿的 18/30 状态使用原树裁片", () => {
    expect(resolveChildTreeAsset({ progress: 2, status: "GROWING", threshold: 30 })).toBe(
      "/assets/orchard/apple-seedling.webp",
    );
    expect(resolveChildTreeAsset({ progress: 10, status: "GROWING", threshold: 30 })).toBe(
      "/assets/orchard/apple-bud.webp",
    );
    expect(resolveChildTreeAsset({ progress: 18, status: "GROWING", threshold: 30 })).toBe(
      "/assets/orchard/apple-reference-lv1-cutout.png",
    );
    expect(resolveChildTreeAsset({ progress: 29, status: "GROWING", threshold: 30 })).toBe(
      "/assets/orchard/apple-fruit-growing.webp",
    );
    expect(resolveChildTreeAsset({ progress: 30, status: "MATURE", threshold: 30 })).toBe(
      "/assets/orchard/apple-mature.webp",
    );
  });
});
