import type {
  AccountShellView,
  FamilyWorkspaceView,
  ParentDashboardView,
  ParentTaskCenterView,
  PresentationTaskItemView,
} from "../../src/application/presentation-models.js";
import type { CoreAction, CoreActorSelection } from "../../src/application/core-api.js";
import { CoreApiClient } from "./core-api.js";
import { cloudReady } from "./cloud-runtime.js";

const client = new CoreApiClient({
  callFunction: async (input) => (await cloudReady()).callFunction(input),
});
const KEY = "task_checkin_session_v1";
let shell: AccountShellView | undefined;
let selectedChildId = "";
let init: Promise<AccountShellView> | undefined;

export async function command<T>(
  action: CoreAction,
  payload: Readonly<Record<string, unknown>> = {},
  actor?: CoreActorSelection,
): Promise<T> {
  const result = await client.execute(action, payload, actor);
  if (!result.ok) throw new Error(result.error.message);
  return result.data as T;
}

export async function accountShell(refresh = false): Promise<AccountShellView> {
  if (!refresh && shell) return shell;
  if (!init)
    init = (async () => {
      await command("BOOTSTRAP_ACCOUNT");
      shell = await command<AccountShellView>("GET_ACCOUNT_SHELL");
      const stored = wx.getStorageSync(KEY) as { childId?: string } | undefined;
      const all = shell.families.flatMap((f) => f.children);
      selectedChildId =
        all.find((c) => c.id === (selectedChildId || stored?.childId))?.id || all[0]?.id || "";
      return shell;
    })().finally(() => {
      init = undefined;
    });
  return init;
}

export async function selectedFamily(): Promise<FamilyWorkspaceView> {
  const childIdAtStart =
    selectedChildId || (wx.getStorageSync(KEY) as { childId?: string } | undefined)?.childId;
  const current = await accountShell();
  const family =
    current.families.find((f) =>
      f.children.some((c) => c.id === (childIdAtStart || selectedChildId)),
    ) || current.families[0];
  if (!family) throw new Error("请先创建家庭并添加孩子");
  return family;
}

export async function selectedChild(): Promise<string> {
  const childIdAtStart =
    selectedChildId || (wx.getStorageSync(KEY) as { childId?: string } | undefined)?.childId;
  await accountShell();
  const childId = childIdAtStart || selectedChildId;
  if (!childId) throw new Error("请先添加孩子");
  return childId;
}

export async function selectChild(id: string): Promise<void> {
  const current = await accountShell();
  if (!current.families.some((f) => f.children.some((c) => c.id === id)))
    throw new Error("未找到该孩子");
  selectedChildId = id;
  wx.setStorageSync(KEY, { childId: id });
}

export function today(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

export async function dashboard(): Promise<ParentDashboardView> {
  return command("GET_PARENT_DASHBOARD", { childId: await selectedChild(), date: today() });
}

export async function taskDetail(id: string): Promise<PresentationTaskItemView> {
  const center = await command<ParentTaskCenterView>("GET_PARENT_TASK_CENTER", {
    childId: await selectedChild(),
  });
  const task = center.items.find((t) => t.assignmentId === id);
  if (!task) throw new Error("任务不存在或已无访问权限");
  return task;
}

export const childClient = {
  async execute(action: CoreAction, payload: Readonly<Record<string, unknown>>) {
    return client.execute(action, payload, { mode: "CHILD", childId: await selectedChild() });
  },
};

export function showError(error: unknown): void {
  wx.showToast({
    icon: "none",
    title: error instanceof Error ? error.message : "请求失败，请重试",
  });
}
