import "./services/compat.js";
import { cloudReady } from "./services/cloud-runtime.js";

App({
  onPageNotFound(query) {
    if (/^\/?pages\/child\//.test(query.path)) {
      wx.reLaunch({ url: "/pages/parent/home/index?legacy=child" });
    }
  },
  onLaunch() {
    void cloudReady().catch((error) => {
      console.error("[CloudBase] 初始化失败", error);
      wx.showToast({ icon: "none", title: "云服务暂不可用，请稍后重试" });
    });
  },
});
