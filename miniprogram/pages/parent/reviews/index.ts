import type { ReviewQueueView } from "../../../../src/application/presentation-models.js";
import { dashboard, selectChild, showError } from "../../../services/session-runtime.js";
import {
  childCommand,
  childSelection,
  guardedNavigate,
  openSelection,
  requireCurrentChild,
} from "../child-context.js";

async function load(page: MiniPageInstance) {
  page.setData({
    loading: true,
    error: "",
    items: [],
    selectedChildId: "",
    selectionRequired: true,
  });
  try {
    const home = await dashboard();
    page.setData(childSelection(home));
    if (home.selectionRequired) return;
    const queue = await childCommand<ReviewQueueView>(home.selectedChild.id, "GET_REVIEW_QUEUE", {
      kind: "FAMILY",
    });
    await requireCurrentChild(home.selectedChild.id);
    page.setData({
      items: queue.items.map((item) => ({
        id: item.assignmentId,
        title: item.title,
        source: "source" in item && item.source === "FAMILY" ? "家庭" : "共育分组",
        academic: item.academicState,
        submittedAt: item.submittedAt || "",
      })),
    });
  } catch (error) {
    showError(error);
    page.setData({ error: error instanceof Error ? error.message : "加载失败" });
  } finally {
    page.setData({ loading: false });
  }
}
Page({
  data: {
    children: [],
    items: [],
    selectedChildId: "",
    selectedName: "",
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
    loading: true,
    error: "",
  },
  async onShow() {
    await load(this);
  },
  openSelection() {
    openSelection(this);
  },
  open(event: { currentTarget: { dataset: { id?: string } } }) {
    if (event.currentTarget.dataset.id)
      guardedNavigate(
        this,
        `/pages/parent/review-detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}&childId=${encodeURIComponent(String(this.data.selectedChildId))}`,
      );
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
});
