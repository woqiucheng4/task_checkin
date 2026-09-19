import type { CoreAction } from "../../../src/application/core-api.js";
import type { SubmissionService } from "../../../src/application/submission-service.js";
import { AccountChildApiClient } from "../../services/core-api.js";
import { coreApiClient, navigate, replace } from "../../services/page-runtime.js";
import {
  dashboard,
  type ParentDashboardPageData,
  selectedChild,
} from "../../services/session-runtime.js";

const accountClient = new AccountChildApiClient(coreApiClient);

export function childSelection(view: ParentDashboardPageData) {
  const children =
    view.accountShell?.families.flatMap((family) => family.children) ?? view.children;
  return {
    children,
    selectedChildId: view.selectedChild.id,
    selectedName: view.selectedChild.nickname,
    selectionRequired: view.selectionRequired,
    selectionMessage: children.length ? "请选择要操作的孩子" : "先添加孩子，再查看任务和成长记录",
    selectionAction: children.length ? "选择孩子" : "创建家庭并添加孩子",
  };
}

/** Freeze child scope for a page/operation; a changed selection must not retarget a resource. */
export function clientForChild(childId: string) {
  return {
    async execute(action: CoreAction, payload: Readonly<Record<string, unknown>>) {
      await requireCurrentChild(childId);
      return accountClient.execute(action, childId, payload);
    },
  };
}

export async function childCommand<T>(
  childId: string,
  action: CoreAction,
  payload: Readonly<Record<string, unknown>> = {},
): Promise<T> {
  const result = await clientForChild(childId).execute(action, payload);
  if (!result.ok) throw new Error(result.error.message);
  return result.data as T;
}

export async function requireCurrentChild(childId: string): Promise<void> {
  if (!childId || (await selectedChild()) !== childId)
    throw new Error("孩子已切换，请返回首页重新选择任务");
}

export async function invalidateChangedChild(page: MiniPageInstance): Promise<void> {
  try {
    await requireCurrentChild(String(page.data.selectedChildId));
  } catch {
    page.setData({
      ready: false,
      images: [],
      task: {},
      mediaAssetIds: [],
      previewImages: [],
      text: "",
      error: "孩子已切换，请返回首页重新选择任务",
    });
  }
}

export function openSelection(page: MiniPageInstance): void {
  navigate(
    (page.data.children as unknown[] | undefined)?.length
      ? "/pages/parent/home/index"
      : "/pages/bootstrap/index",
  );
}

export function guardedNavigate(page: MiniPageInstance, path: string, redirect = false): void {
  if (page.data.loading) return;
  if (page.data.selectionRequired || !page.data.selectedChildId) {
    openSelection(page);
    return;
  }
  (redirect ? replace : navigate)(path);
}

export function taskPath(page: MiniPageInstance, assignmentId: string, submit = false): string {
  return `/pages/parent/${submit ? "task-submit" : "task-detail"}/index?id=${encodeURIComponent(assignmentId)}&childId=${encodeURIComponent(String(page.data.selectedChildId))}`;
}

export async function loadAssignment(
  page: MiniPageInstance,
  query: { id?: string; childId?: string },
) {
  const view = await dashboard();
  page.setData(childSelection(view));
  if (view.selectionRequired) return undefined;
  if (!query.id) throw new Error("缺少任务信息，请返回任务中心重新选择");
  if (query.childId && query.childId !== view.selectedChild.id)
    throw new Error("孩子已切换，请返回首页重新选择任务");
  const item = await childCommand<Awaited<ReturnType<SubmissionService["detail"]>>>(
    view.selectedChild.id,
    "GET_ASSIGNMENT_DETAIL",
    { assignmentId: query.id },
  );
  await requireCurrentChild(view.selectedChild.id);
  page.setData({ assignmentId: query.id });
  return item;
}
