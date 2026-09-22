import type {
  AccountShellView,
  FamilyWorkspaceView,
  ParentDashboardView,
  ParentTaskCenterView,
  PresentationTaskItemView,
} from "../../src/application/presentation-models.js";
import type { CoreAction, CoreActorSelection } from "../../src/application/core-api.js";
import { AccountChildApiClient, CoreApiClient } from "./core-api.js";
import { cloudReady } from "./cloud-runtime.js";

const client = new CoreApiClient({
  callFunction: async (input) => (await cloudReady()).callFunction(input),
});
const accountChildApi = new AccountChildApiClient(client);
const KEY = "task_checkin_session_v1";
const LAST_LOGIN_ROLE_KEY = "task_checkin_last_login_role_v1";
export type LoginRole = "parent" | "teacher";
let shell: AccountShellView | undefined;
let selectedChildId = "";
let init: Promise<AccountShellView> | undefined;

/**
 * Parent page data is available before a child is selected. `selectionRequired`
 * tells the page to render the account's children without issuing a
 * child-scoped request.
 */
export interface ParentDashboardPageData extends ParentDashboardView {
  readonly accountShell: AccountShellView;
  readonly selectionRequired: boolean;
}

export function lastLoginRole(): LoginRole | undefined {
  const role = wx.getStorageSync(LAST_LOGIN_ROLE_KEY);
  return role === "parent" || role === "teacher" ? role : undefined;
}

export function saveLastLoginRole(role: LoginRole): void {
  wx.setStorageSync(LAST_LOGIN_ROLE_KEY, role);
}

export async function command<T>(
  action: CoreAction,
  payload: Readonly<Record<string, unknown>> = {},
  actor?: CoreActorSelection,
  requestId?: string,
): Promise<T> {
  const result = await client.execute(action, payload, actor, requestId);
  if (!result.ok) throw new Error(result.error.message);
  return result.data as T;
}

export async function accountShell(refresh = false): Promise<AccountShellView> {
  if (!refresh && shell) return shell;
  if (!init)
    init = (async () => {
      await command("BOOTSTRAP_ACCOUNT");
      shell = await command<AccountShellView>("GET_ACCOUNT_SHELL");
      const stored = wx.getStorageSync(KEY) as { selectedChildId?: string } | undefined;
      const all = shell.families.flatMap((f) => f.children);
      const preferredChildId = selectedChildId || stored?.selectedChildId || "";
      if (all.some((child) => child.id === preferredChildId)) {
        selectedChildId = preferredChildId;
      } else if (all.length === 1) {
        selectedChildId = all[0]?.id || "";
      } else {
        selectedChildId = "";
      }
      wx.setStorageSync(KEY, selectedChildId ? { selectedChildId } : {});
      return shell;
    })().finally(() => {
      init = undefined;
    });
  return init;
}

export async function selectedFamily(): Promise<FamilyWorkspaceView> {
  const childIdAtStart =
    selectedChildId ||
    (wx.getStorageSync(KEY) as { selectedChildId?: string } | undefined)?.selectedChildId;
  const current = await accountShell();
  const selectedId =
    childIdAtStart &&
    current.families.some((family) => family.children.some((c) => c.id === childIdAtStart))
      ? childIdAtStart
      : selectedChildId;
  const family = current.families.find((f) => f.children.some((c) => c.id === selectedId));
  if (!family) {
    if (!current.families.some((item) => item.children.length))
      throw new Error("请先创建家庭并添加孩子");
    throw new Error("请选择孩子");
  }
  return family;
}

export async function selectedChild(): Promise<string> {
  const childIdAtStart =
    selectedChildId ||
    (wx.getStorageSync(KEY) as { selectedChildId?: string } | undefined)?.selectedChildId;
  const current = await accountShell();
  const children = current.families.flatMap((family) => family.children);
  if (children.length === 0) throw new Error("请先添加孩子");
  const childId = children.some((child) => child.id === childIdAtStart)
    ? childIdAtStart
    : selectedChildId;
  if (!childId || !children.some((child) => child.id === childId)) throw new Error("请选择孩子");
  return childId;
}

export async function selectChild(id: string): Promise<void> {
  const current = await accountShell();
  if (!current.families.some((f) => f.children.some((c) => c.id === id)))
    throw new Error("未找到该孩子");
  selectedChildId = id;
  wx.setStorageSync(KEY, { selectedChildId: id });
}

export function today(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

export async function dashboard(): Promise<ParentDashboardPageData> {
  const current = await accountShell();
  if (!hasSelectedChild(current)) return selectionRequiredDashboard(current);
  return {
    ...(await accountChildCommand<ParentDashboardView>("GET_PARENT_DASHBOARD", { date: today() })),
    accountShell: current,
    selectionRequired: false,
  };
}

export async function taskDetail(id: string): Promise<PresentationTaskItemView> {
  const center = await accountChildCommand<ParentTaskCenterView>("GET_PARENT_TASK_CENTER", {});
  const task = center.items.find((t) => t.assignmentId === id);
  if (!task) throw new Error("任务不存在或已无访问权限");
  return task;
}

export const accountChildClient = {
  async execute(action: CoreAction, payload: Readonly<Record<string, unknown>>) {
    return accountChildApi.execute(action, await selectedChild(), payload);
  },
};

async function accountChildCommand<T>(
  action: CoreAction,
  payload: Readonly<Record<string, unknown>>,
): Promise<T> {
  const result = await accountChildClient.execute(action, payload);
  if (!result.ok) throw new Error(result.error.message);
  return result.data as T;
}

function hasSelectedChild(current: AccountShellView): boolean {
  return current.families.some((family) =>
    family.children.some((child) => child.id === selectedChildId),
  );
}

function selectionRequiredDashboard(current: AccountShellView): ParentDashboardPageData {
  return {
    accountShell: current,
    selectionRequired: true,
    children: current.families.flatMap((family) =>
      family.children.map((child) => ({ ...child, selected: false })),
    ),
    selectedChild: { id: "", nickname: "" },
    family: { id: "", name: "" },
    today: {
      allDone: false,
      completedCount: 0,
      date: today(),
      items: [],
      pendingReviewCount: 0,
      requiredCount: 0,
    },
    groups: [],
  };
}

export function showError(error: unknown): void {
  wx.showToast({
    icon: "none",
    title: error instanceof Error ? error.message : "请求失败，请重试",
  });
}
