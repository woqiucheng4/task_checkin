import type {
  ParentTaskCenterView,
  PresentationTaskItemView,
} from "../../../../src/application/presentation-models.js";
import { command, selectedChild, showError, today } from "../../../services/session-runtime.js";
import { buildNavigation, buildTaskRow } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: {
    filter: "ALL",
    navigation: buildNavigation("parent", "tasks"),
    tasks: [],
    allTasks: [],
    child: "",
    date: today(),
    loading: true,
    error: "",
  },
  async onShow() {
    this.setData({ loading: true, error: "" });
    try {
      const result = await command<ParentTaskCenterView>("GET_PARENT_TASK_CENTER", {
        childId: await selectedChild(),
      });
      this.setData({ allTasks: result.items, child: result.child.nickname });
      display(this, String(this.data.filter));
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "加载失败" });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  chooseFilter(event: {
    readonly currentTarget: { readonly dataset: { readonly filter?: string } };
  }) {
    const filter = event.currentTarget.dataset.filter;
    if (filter !== undefined) display(this, filter);
  },
  createTask() {
    navigate("/pages/parent/task-editor/index");
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openTask(event: { readonly detail: { readonly assignmentId?: string } }) {
    const id = event.detail.assignmentId;
    if (id !== undefined) navigate(`/pages/parent/review-detail/index?id=${id}`);
  },
});

function display(page: MiniPageInstance, filter: string): void {
  const all = page.data.allTasks as PresentationTaskItemView[];
  page.setData({
    filter,
    tasks: all
      .filter((task) => filter === "ALL" || task.source === filter)
      .map((task) => ({ ...buildTaskRow(task), focus: task.importance === "REQUIRED" })),
  });
}
