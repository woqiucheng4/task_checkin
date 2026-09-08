import { navigate } from "../../../services/page-runtime.js";
import {
  command,
  selectedChild,
  selectedFamily,
  showError,
} from "../../../services/session-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
async function load(page: MiniPageInstance) {
  const childId = await selectedChild();
  const family = await selectedFamily();
  const view = await command<Awaited<ReturnType<PresentationService["childGroups"]>>>(
    "GET_CHILD_GROUPS",
    { childId },
  );
  page.setData({
    nickname: family.children.find((c) => c.id === childId)?.nickname || "",
    groups: view.memberships,
    pending: view.pending,
  });
}
Page({
  data: {
    groups: [],
    pending: [],
    nickname: "",
    showWithdraw: false,
    withdrawId: "",
    withdrawName: "",
    working: false,
  },
  async onShow() {
    try {
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
  openInvitation() {
    navigate("/pages/shared/invitation/index");
  },
  requestWithdraw(event: { currentTarget: { dataset: { id?: string; name?: string } } }) {
    if (event.currentTarget.dataset.id)
      this.setData({
        showWithdraw: true,
        withdrawId: event.currentTarget.dataset.id,
        withdrawName: event.currentTarget.dataset.name || "",
      });
  },
  cancelWithdraw() {
    this.setData({ showWithdraw: false, withdrawId: "" });
  },
  async confirmWithdraw() {
    if (this.data.working || !this.data.withdrawId) return;
    this.setData({ working: true });
    try {
      await command("WITHDRAW_CHILD", { childGroupMembershipId: this.data.withdrawId });
      this.setData({ showWithdraw: false, withdrawId: "" });
      await load(this);
      wx.showToast({ icon: "success", title: "已退出分组" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
