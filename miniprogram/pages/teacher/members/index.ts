import { command, showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup, teacherWorkspace } from "../../../services/teacher-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
async function load(page: MiniPageInstance) {
  const group = await selectedTeacherGroup();
  const pending = await command<Awaited<ReturnType<PresentationService["groupJoinRequests"]>>>(
    "GET_GROUP_JOIN_REQUESTS",
    { groupId: group.id },
  );
  const workspace = await teacherWorkspace();
  page.setData({ groupName: group.name, pending, members: workspace.members });
}
Page({
  data: {
    groupName: "",
    pending: [],
    members: [],
    inviteOpen: false,
    inviteCode: "",
    inviteExpires: "",
    working: false,
  },
  async onShow() {
    try {
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
  async approve(event?: { currentTarget: { dataset: { id?: string } } }) {
    const id = event?.currentTarget.dataset.id;
    if (!id || this.data.working) return;
    this.setData({ working: true });
    try {
      await command("APPROVE_JOIN_REQUEST", { joinRequestId: id });
      await load(this);
      wx.showToast({ icon: "success", title: "已批准入组" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
  async reject(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (!id || this.data.working) return;
    this.setData({ working: true });
    try {
      await command("REJECT_JOIN_REQUEST", { joinRequestId: id });
      await load(this);
      wx.showToast({ icon: "success", title: "已拒绝申请" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
  async createInvite() {
    if (this.data.working) return;
    this.setData({ working: true });
    try {
      const group = await selectedTeacherGroup();
      const result = await command<{ code: string; expiresAt: string }>("CREATE_GROUP_INVITATION", {
        groupId: group.id,
        expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
        maxClaims: 100,
      });
      this.setData({
        inviteOpen: true,
        inviteCode: result.code,
        inviteExpires: new Date(Date.parse(result.expiresAt) + 8 * 3600000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
      });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
