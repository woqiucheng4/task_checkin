import { coreApiClient } from "../../../services/page-runtime.js";

Page({
  data: {
    creating: false,
    title: "",
    wishes: [
      { fruit: "苹果 × 2", id: "wish-1", progress: 2, target: 3, title: "周末去自然博物馆" },
      { fruit: "尚未关联", id: "wish-2", progress: 0, target: 2, title: "选一本新的故事书" },
    ],
  },
  beginCreate() {
    this.setData({ creating: true });
  },
  editTitle(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ title: event.detail.value ?? "" });
  },
  async createWish() {
    const title = String(this.data.title ?? "").trim();
    if (!title) {
      wx.showToast({ icon: "none", title: "请填写愿望" });
      return;
    }
    const result = await coreApiClient.execute("CREATE_WISH", {
      childId: "child-a",
      targetFruitCount: 3,
      title,
    });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "愿望已保存" : result.error.message,
    });
    if (result.ok) this.setData({ creating: false, title: "" });
  },
  async fulfill() {
    const result = await coreApiClient.execute("FULFILL_WISH", { wishId: "wish-1" });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "愿望已兑现" : result.error.message,
    });
  },
});
