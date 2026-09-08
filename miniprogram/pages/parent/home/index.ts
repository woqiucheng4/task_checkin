import { buildNavigation, buildTaskRow } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { dashboard, selectChild, showError, today } from "../../../services/session-runtime.js";

async function load(page: MiniPageInstance) {
  try {
    const view = await dashboard();
    page.setData({
      children: view.children,
      selectedChildId: view.selectedChild.id,
      selectedName: view.selectedChild.nickname,
      tasks: view.today.items.map(buildTaskRow),
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
  },
  onShow() {
    void load(this);
  },
  createTask() {
    navigate("/pages/parent/task-editor/index");
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) replace(event.detail.path);
  },
  openReview() {
    navigate("/pages/parent/reviews/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  openTask(event: { detail: { assignmentId?: string } }) {
    if (event.detail.assignmentId)
      navigate(`/pages/parent/review-detail/index?id=${event.detail.assignmentId}`);
  },
  async selectChild(event: { currentTarget: { dataset: { id?: string } } }) {
    if (!event.currentTarget.dataset.id) return;
    try {
      await selectChild(event.currentTarget.dataset.id);
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
});
