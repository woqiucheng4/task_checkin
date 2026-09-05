import { coreApiClient, navigate } from "../../../services/page-runtime.js";

Page({
  data: { joined: false, showWithdraw: false },
  onLoad(query: { readonly joined?: string }) {
    this.setData({ joined: query.joined === "1" });
  },
  openInvitation() {
    navigate("/pages/shared/invitation/index");
  },
  requestWithdraw() {
    this.setData({ showWithdraw: true });
  },
  cancelWithdraw() {
    this.setData({ showWithdraw: false });
  },
  async confirmWithdraw() {
    const result = await coreApiClient.execute("WITHDRAW_CHILD", { membershipId: "membership-1" });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "已退出分组" : result.error.message,
    });
    if (result.ok) this.setData({ showWithdraw: false });
  },
});
