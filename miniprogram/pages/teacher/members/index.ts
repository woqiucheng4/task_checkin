import { coreApiClient } from "../../../services/page-runtime.js";

Page({
  data: {
    inviteOpen: false,
    pending: [{ id: "request-1", name: "晨曦 31", guardian: "家长已确认披露范围" }],
    seats: [{ code: "A-18", status: "待认领" }],
  },
  onLoad(query: { readonly invite?: string }) {
    this.setData({ inviteOpen: query.invite === "1" });
  },
  async approve() {
    const result = await coreApiClient.execute("APPROVE_JOIN_REQUEST", {
      requestIdToApprove: "request-1",
    });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "已批准入组" : result.error.message,
    });
  },
  async createInvite() {
    const result = await coreApiClient.execute("CREATE_GROUP_INVITATION", {
      expiresInHours: 72,
      groupId: "group-1",
    });
    this.setData({ inviteOpen: true });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "邀请已生成" : result.error.message,
    });
  },
});
