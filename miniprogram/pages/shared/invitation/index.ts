Page({
  data: { state: "ready" },
  confirmJoin() {
    wx.redirectTo({ url: "/pages/parent/groups/index?joined=1" });
  },
  retry() {
    wx.redirectTo({ url: "/pages/shared/invitation/index" });
  },
});
