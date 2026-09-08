import type { ReviewQueueView } from "../../../../src/application/presentation-models.js";
import { navigate } from "../../../services/page-runtime.js";
import {
  accountShell,
  command,
  selectedChild,
  selectChild,
  showError,
} from "../../../services/session-runtime.js";
async function load(page: MiniPageInstance) {
  try {
    const shell = await accountShell();
    const childId = await selectedChild();
    const queue = await command<ReviewQueueView>("GET_REVIEW_QUEUE", { kind: "FAMILY", childId });
    page.setData({
      children: shell.families
        .flatMap((f) => f.children)
        .map((c) => ({ id: c.id, name: c.nickname })),
      selected: childId,
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
  }
}
Page({
  data: { children: [], items: [], selected: "" },
  onShow() {
    void load(this);
  },
  open(event: { currentTarget: { dataset: { id?: string } } }) {
    if (event.currentTarget.dataset.id)
      navigate(`/pages/parent/review-detail/index?id=${event.currentTarget.dataset.id}`);
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
