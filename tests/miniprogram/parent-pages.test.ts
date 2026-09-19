import { describe, expect, it, vi } from "vitest";
import { ParentController } from "../../miniprogram/controllers/parent-controller.js";
import { buildParentReviewPage } from "../../miniprogram/presentation/page-models.js";

describe("家长端核心旅程", () => {
  it("切换孩子后不保留上一个孩子的任务状态", () => {
    const controller = new ParentController(
      { execute: vi.fn() },
      [
        { id: "child-a", nickname: "小果", tasks: [{ childLabel: "小果", id: "a" }] },
        { id: "child-b", nickname: "小禾", tasks: [{ childLabel: "小禾", id: "b" }] },
      ],
      "child-a",
    );

    expect(controller.selectChild("child-b").selectedChildId).toBe("child-b");
    expect(controller.current().taskItems.every((item) => item.childLabel === "小禾")).toBe(true);
  });

  it("学校任务把学习评价和家庭阳光确认明确分开", () => {
    expect(
      buildParentReviewPage({
        academicState: "APPROVED",
        rewardState: "PENDING_CONFIRMATION",
        source: "SCHOOL",
      }).sections.map((section) => section.kind),
    ).toEqual(["ACADEMIC_STATUS", "FAMILY_REWARD"]);
  });

  it("完成家庭审核调用家庭阳光命令", async () => {
    const execute = vi.fn().mockResolvedValue({ data: {}, ok: true });
    const controller = new ParentController({ execute }, [], "child-a");

    await controller.confirmSunlight("assignment-1", 6);

    expect(execute).toHaveBeenCalledWith(
      "FAMILY_REVIEW",
      expect.objectContaining({
        childId: "child-a",
        assignmentId: "assignment-1",
        decision: "APPROVE",
      }),
    );
    expect(controller.current().notice).toBe("已确认，6 阳光已存入果树");
  });
});
