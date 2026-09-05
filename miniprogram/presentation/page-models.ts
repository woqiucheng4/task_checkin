import type {
  PresentationTaskItemView,
  TodaySummaryView,
  TreeSummaryView,
} from "../../src/application/presentation-models.js";

export type ScreenState = "loading" | "empty" | "ready" | "offline" | "error" | "success";

export interface NavigationItem {
  readonly icon: string;
  readonly key: string;
  readonly label: string;
  readonly path: string;
  readonly selected: boolean;
}

export type TaskRowAction =
  | { readonly kind: "PRIMARY"; readonly label: string }
  | { readonly kind: "STATUS"; readonly label: string }
  | { readonly kind: "REVISION"; readonly label: string };

export interface TaskRowPageModel {
  readonly assignmentId: string;
  readonly category: string;
  readonly description?: string;
  readonly dueLabel: string;
  readonly sourceLabel: string;
  readonly sourceTone: "family" | "school";
  readonly title: string;
  readonly action: TaskRowAction;
}

export interface ChildTodayInput {
  readonly date: string;
  readonly nickname: string;
  readonly screenState: ScreenState;
  readonly sunlight: { readonly current: number; readonly target: number };
  readonly tasks: readonly PresentationTaskItemView[];
  readonly tree: {
    readonly asset: string;
    readonly level: number;
    readonly name: string;
  };
}

export interface ChildTodayPageModel extends Omit<ChildTodayInput, "tasks"> {
  readonly navigation: readonly NavigationItem[];
  readonly progressPercent: number;
  readonly remainingSunlight: number;
  readonly tasks: readonly TaskRowPageModel[];
}

const SOURCE_LABELS = {
  FAMILY: "家庭",
  LEARNING_GROUP: "学习小组",
  SCHOOL: "学校",
  TUTORING: "辅导班",
} as const;
const CATEGORY_LABELS = {
  ART: "艺术",
  ENGLISH: "英语",
  LANGUAGE: "语文",
  LIFE: "自理",
  MATHEMATICS: "数学",
  OTHER: "成长",
  SCIENCE: "科学",
  SPORT: "运动",
} as const;

export function buildTaskRow(task: PresentationTaskItemView): TaskRowPageModel {
  return {
    action: resolveTaskAction(task),
    assignmentId: task.assignmentId,
    category: CATEGORY_LABELS[task.category],
    ...(task.description === undefined ? {} : { description: task.description }),
    dueLabel: formatDueTime(task.dueAt),
    sourceLabel: SOURCE_LABELS[task.source],
    sourceTone: task.source === "FAMILY" ? "family" : "school",
    title: task.title,
  };
}

export function buildChildTodayPage(input: ChildTodayInput): ChildTodayPageModel {
  const target = Math.max(input.sunlight.target, 1);
  return {
    ...input,
    navigation: buildNavigation("child", "today"),
    progressPercent: Math.min(100, Math.round((input.sunlight.current / target) * 100)),
    remainingSunlight: Math.max(0, input.sunlight.target - input.sunlight.current),
    tasks: input.tasks.map(buildTaskRow),
  };
}

export function buildParentHomePage(input: {
  readonly childCount: number;
  readonly pendingReviews: number;
}): {
  readonly navigation: readonly NavigationItem[];
  readonly primaryAction: string;
  readonly summary: string;
} {
  return {
    navigation: buildNavigation("parent", "home"),
    primaryAction: input.pendingReviews > 0 ? "去审核" : "查看今日任务",
    summary: `${input.childCount} 个孩子 · ${input.pendingReviews} 项待审核`,
  };
}

export function buildTeacherHomePage(input: {
  readonly dueToday: number;
  readonly pendingReviews: number;
}): {
  readonly navigation: readonly NavigationItem[];
  readonly primaryAction: string;
  readonly summary: string;
} {
  return {
    navigation: buildNavigation("teacher", "home"),
    primaryAction: input.pendingReviews > 0 ? "开始审核" : "发布任务",
    summary: `今日截止 ${input.dueToday} 项 · 待审核 ${input.pendingReviews} 项`,
  };
}

export function buildTodayProgress(today: TodaySummaryView): {
  readonly completed: number;
  readonly label: string;
  readonly total: number;
} {
  return {
    completed: today.completedCount,
    label: today.allDone ? "今日任务已全部完成" : `已完成 ${today.completedCount} 项`,
    total: today.requiredCount,
  };
}

export function buildTreeHero(tree: TreeSummaryView): {
  readonly progressPercent: number;
  readonly remaining: number;
  readonly stageLabel: string;
} {
  return {
    progressPercent: Math.min(100, Math.round((tree.progress / Math.max(tree.threshold, 1)) * 100)),
    remaining: Math.max(0, tree.threshold - tree.progress),
    stageLabel: tree.status === "MATURE" ? "可以采摘啦" : tree.stage,
  };
}

export function buildNavigation(
  role: "child" | "parent" | "teacher",
  selected: string,
): readonly NavigationItem[] {
  const definitions = {
    child: [
      ["today", "今日", "/pages/child/today/index", "calendar"],
      ["orchard", "果园", "/pages/child/orchard/index", "image"],
      ["profile", "我的", "/pages/child/profile/index", "user"],
    ],
    parent: [
      ["home", "今日", "/pages/parent/home/index", "home"],
      ["tasks", "任务", "/pages/parent/tasks/index", "task"],
      ["orchard", "果园", "/pages/parent/orchard/index", "image"],
      ["profile", "我的", "/pages/parent/profile/index", "user"],
    ],
    teacher: [
      ["home", "今日", "/pages/teacher/home/index", "home"],
      ["groups", "班级", "/pages/teacher/groups/index", "usergroup"],
      ["tasks", "任务", "/pages/teacher/tasks/index", "task"],
      ["profile", "我的", "/pages/teacher/profile/index", "user"],
    ],
  } as const;
  return definitions[role].map(([key, label, path, icon]) => ({
    icon,
    key,
    label,
    path,
    selected: key === selected,
  }));
}

function resolveTaskAction(task: PresentationTaskItemView): TaskRowAction {
  if (task.rewardState === "PROTECTED") {
    return { kind: "STATUS", label: "待确认 · 阳光已保护" };
  }
  if (task.taskState === "REVISION_REQUIRED" || task.academicState === "REVISION_REQUIRED") {
    return { kind: "REVISION", label: "去订正" };
  }
  if (task.taskState === "COMPLETED") {
    return { kind: "STATUS", label: "已完成" };
  }
  if (task.taskState === "SUBMITTED") {
    return { kind: "STATUS", label: "等待确认" };
  }
  return { kind: "PRIMARY", label: "去完成" };
}

function formatDueTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return `截止 ${date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  })}`;
}
