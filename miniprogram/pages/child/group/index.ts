import { dashboard, command, selectedChild, showError } from "../../../services/session-runtime.js";
import type { ChildGroupProgressView } from "../../../../src/application/group-orchard-service.js";
Page({
  data: { groups: [], selected: 0, loading: true },
  async onShow() {
    this.setData({ loading: true });
    try {
      const home = await dashboard();
      const childId = await selectedChild();
      const groups = await Promise.all(
        home.groups.map(async (group) => {
          try {
            const progress = await command<ChildGroupProgressView>(
              "GET_GROUP_PROGRESS",
              { groupId: group.id },
              { mode: "CHILD", childId },
            );
            return {
              ...group,
              current: progress.progress,
              target: progress.threshold,
              percent: Math.min(100, (progress.progress / Math.max(1, progress.threshold)) * 100),
              error: "",
            };
          } catch (error) {
            return {
              ...group,
              error: error instanceof Error ? error.message : "进度加载失败",
              current: 0,
              target: 0,
              percent: 0,
            };
          }
        }),
      );
      this.setData({ groups, selected: 0 });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  selectGroup(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isInteger(index) && index >= 0 && index < (this.data.groups as unknown[]).length)
      this.setData({ selected: index });
  },
});
