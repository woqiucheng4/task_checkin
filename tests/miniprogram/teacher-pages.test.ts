import { describe, expect, it, vi } from "vitest";
import { TeacherController } from "../../miniprogram/controllers/teacher-controller.js";
import {
  buildGroupTreePage,
  buildTeacherWorkbench,
} from "../../miniprogram/presentation/page-models.js";

describe("教师和助教端核心旅程", () => {
  it("按订正、待审核、今日截止的顺序组织工作台", () => {
    expect(
      buildTeacherWorkbench({ dueToday: 6, pendingReview: 4, revisionRequired: 2 }).sections.map(
        (item) => item.kind,
      ),
    ).toEqual(["REVISION", "PENDING_REVIEW", "DUE_TODAY"]);
  });

  it("共育树模型不包含个人排名或全局孩子标识", () => {
    const page = buildGroupTreePage({
      groupName: "三年级 2 班",
      memberCount: 32,
      progress: 126,
      target: 180,
    });
    expect(JSON.stringify(page)).not.toMatch(/rank|contributor|childId/i);
  });

  it("学习审核与家庭阳光确认使用不同命令", async () => {
    const execute = vi.fn().mockResolvedValue({ data: {}, ok: true });
    const controller = new TeacherController({ execute });
    await controller.approve("assignment-1", "朗读流畅");
    expect(execute).toHaveBeenCalledWith(
      "ACADEMIC_REVIEW",
      expect.objectContaining({ assignmentId: "assignment-1", decision: "APPROVE" }),
    );
    expect(controller.current().notice).toBe("学习评价已通过，等待家庭确认阳光");
  });
});
