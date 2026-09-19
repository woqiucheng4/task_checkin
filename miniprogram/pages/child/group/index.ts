export {};

Page({
  data: { notice: "请由家长选择孩子后继续操作" },
  onShow() {
    wx.redirectTo({ url: "/pages/parent/home/index?legacy=child" });
  },
});
