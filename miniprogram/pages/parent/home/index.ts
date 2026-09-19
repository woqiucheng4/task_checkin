import { buildNavigation, buildParentTaskRow } from "../../../presentation/page-models.js";
import { navigate } from "../../../services/page-runtime.js";
import { dashboard, selectChild, showError, today } from "../../../services/session-runtime.js";
import { childSelection, guardedNavigate, openSelection, taskPath } from "../child-context.js";

async function load(page: MiniPageInstance) {
  page.setData({
    loading: true,
    selectionRequired: true,
    selectedChildId: "",
    tasks: [],
    pendingReviews: 0,
    current: 0,
  });
  try {
    const view = await dashboard();
    page.setData({
      ...childSelection(view),
      tasks: view.today.items.map(buildParentTaskRow),
      pendingReviews: view.today.pendingReviewCount,
      current: view.currentTree?.progress || 0,
      target: view.currentTree?.threshold || 30,
      treeName: view.currentTree?.name || "还没有种树",
      date: today(),
      notice: "",
    });
  } catch (error) {
    showError(error);
    page.setData({ notice: error instanceof Error ? error.message : "加载失败" });
  } finally {
    page.setData({ loading: false });
  }
}
Page({
  data: {
    children: [],
    navigation: buildNavigation("parent", "home"),
    pendingReviews: 0,
    selectedChildId: "",
    selectedName: "",
    tasks: [],
    current: 0,
    target: 30,
    treeName: "",
    date: today(),
    notice: "",
    loading: true,
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
  },
  onLoad(query: { legacy?: string }) {
    if (query.legacy) wx.showToast({ icon: "none", title: "请由家长选择孩子后继续操作" });
  },
  async onShow() {
    await load(this);
  },
  createTask() {
    guardedNavigate(this, "/pages/parent/task-editor/index");
  },
  openSelection() {
    openSelection(this);
  },
  openOrchard() {
    guardedNavigate(this, "/pages/parent/orchard/index");
  },
  openGroups() {
    guardedNavigate(this, "/pages/parent/groups/index");
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) guardedNavigate(this, event.detail.path, true);
  },
  openReview() {
    guardedNavigate(this, "/pages/parent/reviews/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  openTask(event: { detail: { assignmentId?: string } }) {
    if (event.detail.assignmentId) guardedNavigate(this, taskPath(this, event.detail.assignmentId));
  },
  async selectChild(event: { currentTarget: { dataset: { id?: string } } }) {
    if (!event.currentTarget.dataset.id) return;
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      await selectChild(event.currentTarget.dataset.id);
      await load(this);
    } catch (error) {
      showError(error);
      this.setData({ loading: false });
    }
  },
});
