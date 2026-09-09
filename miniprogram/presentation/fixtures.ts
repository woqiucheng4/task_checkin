import type { PresentationTaskItemView } from "../../src/application/presentation-models.js";
import type { ChildTodayInput, ScreenState } from "./page-models.js";

const tasks: readonly PresentationTaskItemView[] = [
  {
    academicState: "NOT_REQUIRED",
    assignmentId: "family-desk",
    category: "LIFE",
    description: "分类摆放书本和文具，保持整洁",
    dueAt: "2026-09-05T14:00:00.000Z",
    importance: "FOCUS",
    rewardState: "NOT_ELIGIBLE",
    source: "FAMILY",
    startsAt: "2026-09-04T16:00:00.000Z",
    submissionMode: "PHOTO",
    taskState: "PENDING",
    title: "整理自己的书桌",
  },
  {
    academicState: "PENDING",
    assignmentId: "school-reading",
    category: "LANGUAGE",
    description: "认真朗读课文，录音 2 分钟",
    dueAt: "2026-09-05T12:00:00.000Z",
    groupName: "三年级 2 班",
    importance: "REQUIRED",
    rewardState: "NOT_ELIGIBLE",
    source: "SCHOOL",
    startsAt: "2026-09-04T16:00:00.000Z",
    submissionMode: "CONFIRM",
    taskState: "PENDING",
    title: "语文 · 朗读《秋天的雨》",
  },
  {
    academicState: "APPROVED",
    assignmentId: "school-math",
    category: "MATHEMATICS",
    description: "拍照上传作业结果",
    dueAt: "2026-09-05T13:00:00.000Z",
    groupName: "三年级 2 班",
    importance: "REQUIRED",
    rewardState: "PROTECTED",
    source: "SCHOOL",
    startsAt: "2026-09-04T16:00:00.000Z",
    submissionMode: "PHOTO",
    taskState: "SUBMITTED",
    title: "数学 · 完成练习题 5 道",
  },
];

function fixture(screenState: ScreenState): ChildTodayInput {
  return {
    date: "2026年9月5日 星期六",
    nickname: "小禾",
    screenState,
    sunlight: { current: 18, target: 30 },
    tasks: screenState === "empty" ? [] : tasks,
    tree: { asset: "/assets/orchard/apple-mature.webp", level: 1, name: "苹果树" },
  };
}

export const childFixtures = {
  empty: fixture("empty"),
  error: fixture("error"),
  loading: fixture("loading"),
  offline: fixture("offline"),
  ready: fixture("ready"),
} as const;

export const childTaskFixtures = tasks;
