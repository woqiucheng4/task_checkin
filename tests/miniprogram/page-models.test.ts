import { describe, expect, it } from "vitest";
import type { PresentationTaskItemView } from "../../src/application/presentation-models.js";
import {
  buildChildTodayPage,
  buildParentHomePage,
  buildTaskRow,
  buildTeacherHomePage,
} from "../../miniprogram/presentation/page-models.js";

const protectedTask: PresentationTaskItemView = {
  academicState: "PENDING",
  assignmentId: "assignment-1",
  category: "LANGUAGE",
  dueAt: "2026-09-05T20:00:00.000Z",
  importance: "REQUIRED",
  rewardState: "PROTECTED",
  source: "SCHOOL",
  startsAt: "2026-09-05T00:00:00.000Z",
  submissionMode: "CONFIRM",
  taskState: "SUBMITTED",
  title: "语文 · 朗读《秋天的雨》",
};

describe("小程序页面映射", () => {
  it("把已保护的提交映射为不可破坏的状态提示", () => {
    expect(buildTaskRow(protectedTask).action).toEqual({
      kind: "STATUS",
      label: "待确认 · 阳光已保护",
    });
  });

  it("构建孩子、家长和教师三种首页模型", () => {
    const child = buildChildTodayPage({
      date: "2026年9月5日 星期六",
      nickname: "小禾",
      screenState: "ready",
      sunlight: { current: 18, target: 30 },
      tasks: [protectedTask],
      tree: { asset: "/assets/orchard/apple-mature.png", level: 1, name: "苹果树" },
    });
    expect(child.navigation.map((item) => item.label)).toEqual(["今日", "果园", "我的"]);
    expect(child.tasks[0]?.sourceLabel).toBe("学校");

    expect(buildParentHomePage({ childCount: 2, pendingReviews: 3 }).primaryAction).toBe("去审核");
    expect(buildTeacherHomePage({ dueToday: 6, pendingReviews: 4 }).primaryAction).toBe("开始审核");
  });
});
