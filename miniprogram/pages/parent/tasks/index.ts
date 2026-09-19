import type {
  ParentTaskCenterView,
  PresentationTaskItemView,
} from "../../../../src/application/presentation-models.js";
import { buildNavigation, buildParentTaskRow } from "../../../presentation/page-models.js";
import { dashboard, selectChild, showError, today } from "../../../services/session-runtime.js";
import {
  childCommand,
  childSelection,
  guardedNavigate,
  openSelection,
  requireCurrentChild,
  taskPath,
} from "../child-context.js";

async function load(page: MiniPageInstance) {
  page.setData({
    loading: true,
    error: "",
    tasks: [],
    allTasks: [],
    selectedChildId: "",
    selectionRequired: true,
  });
  try {
    const view = await dashboard();
    page.setData(childSelection(view));
    if (view.selectionRequired) return;
    const result = await childCommand<ParentTaskCenterView>(
      view.selectedChild.id,
      "GET_PARENT_TASK_CENTER",
    );
    await requireCurrentChild(view.selectedChild.id);
    page.setData({ allTasks: result.items });
    display(page, String(page.data.filter));
  } catch (error) {
    page.setData({ error: error instanceof Error ? error.message : "加载失败" });
    showError(error);
  } finally {
    page.setData({ loading: false });
  }
}

Page({
  data: {
    filter: "ALL",
    navigation: buildNavigation("parent", "tasks"),
    tasks: [],
    allTasks: [],
    children: [],
    selectedChildId: "",
    selectedName: "",
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
    date: today(),
    loading: true,
    error: "",
  },
  async onShow() {
    await load(this);
  },
  async selectChild(event: { currentTarget: { dataset: { id?: string } } }) {
    if (this.data.loading || !event.currentTarget.dataset.id) return;
    this.setData({ loading: true });
    try {
      await selectChild(event.currentTarget.dataset.id);
      await load(this);
    } catch (error) {
      showError(error);
      this.setData({ loading: false });
    }
  },
  chooseFilter(event: { currentTarget: { dataset: { filter?: string } } }) {
    if (event.currentTarget.dataset.filter) display(this, event.currentTarget.dataset.filter);
  },
  openSelection() {
    openSelection(this);
  },
  createTask() {
    guardedNavigate(this, "/pages/parent/task-editor/index");
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) guardedNavigate(this, event.detail.path, true);
  },
  openTask(event: { detail: { assignmentId?: string } }) {
    if (event.detail.assignmentId) guardedNavigate(this, taskPath(this, event.detail.assignmentId));
  },
});

function display(page: MiniPageInstance, filter: string): void {
  const all = page.data.allTasks as PresentationTaskItemView[];
  page.setData({
    filter,
    tasks: all
      .filter((task) => filter === "ALL" || task.source === filter)
      .map((task) => ({
        ...buildParentTaskRow(task),
        focus: task.importance === "REQUIRED",
      })),
  });
}
