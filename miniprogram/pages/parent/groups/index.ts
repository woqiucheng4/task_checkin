import type { PresentationService } from "../../../../src/application/presentation-service.js";
import { navigate } from "../../../services/page-runtime.js";
import { dashboard, selectChild, showError } from "../../../services/session-runtime.js";
import {
  childCommand,
  childSelection,
  openSelection,
  requireCurrentChild,
} from "../child-context.js";

async function load(page: MiniPageInstance) {
  page.setData({
    loading: true,
    selectedChildId: "",
    selectionRequired: true,
    groups: [],
    pending: [],
    showWithdraw: false,
    withdrawId: "",
    invitationChildId: "",
  });
  try {
    const home = await dashboard();
    page.setData({
      ...childSelection(home),
      invitationChildren: childSelection(home).children,
      nickname: home.selectedChild.nickname,
    });
    if (home.selectionRequired) return;
    const view = await childCommand<Awaited<ReturnType<PresentationService["childGroups"]>>>(
      home.selectedChild.id,
      "GET_CHILD_GROUPS",
    );
    await requireCurrentChild(home.selectedChild.id);
    page.setData({ groups: view.memberships, pending: view.pending });
  } finally {
    page.setData({ loading: false });
  }
}
Page({
  data: {
    groups: [],
    pending: [],
    nickname: "",
    children: [],
    selectedChildId: "",
    selectedName: "",
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
    invitationChildren: [],
    invitationChildId: "",
    showWithdraw: false,
    withdrawId: "",
    withdrawName: "",
    working: false,
    loading: true,
  },
  async onShow() {
    try {
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
  openSelection() {
    openSelection(this);
  },
  async chooseInvitationChild(event: { currentTarget: { dataset: { childId?: string } } }) {
    const childId = event.currentTarget.dataset.childId;
    if (
      this.data.loading ||
      this.data.working ||
      !childId ||
      !(this.data.children as { id: string }[]).some((child) => child.id === childId)
    )
      return;
    this.setData({ loading: true });
    try {
      await selectChild(childId);
      await load(this);
      this.setData({ invitationChildId: childId });
    } catch (error) {
      showError(error);
      this.setData({ loading: false });
    }
  },
  async openInvitation() {
    const childId = String(this.data.invitationChildId || "");
    if (!childId || this.data.selectionRequired) {
      wx.showToast({ icon: "none", title: "请先选择要申请入组的孩子" });
      return;
    }
    try {
      await requireCurrentChild(childId);
      navigate(`/pages/shared/invitation/index?childId=${encodeURIComponent(childId)}`);
    } catch (error) {
      showError(error);
    }
  },
  requestWithdraw(event: { currentTarget: { dataset: { id?: string; name?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (
      !this.data.selectionRequired &&
      id &&
      (this.data.groups as { id: string }[]).some((group) => group.id === id)
    )
      this.setData({
        showWithdraw: true,
        withdrawId: id,
        withdrawName: event.currentTarget.dataset.name || "",
      });
  },
  cancelWithdraw() {
    this.setData({ showWithdraw: false, withdrawId: "" });
  },
  async confirmWithdraw() {
    if (this.data.working || this.data.selectionRequired || !this.data.withdrawId) return;
    this.setData({ working: true });
    try {
      await childCommand(String(this.data.selectedChildId), "WITHDRAW_CHILD", {
        childGroupMembershipId: this.data.withdrawId,
      });
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
