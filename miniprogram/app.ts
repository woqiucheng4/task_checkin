import "./services/compat.js";
import { cloudReady } from "./services/cloud-runtime.js";

App({
  onLaunch() {
    void cloudReady().catch(() => {
      wx.showToast({ icon: "none", title: "云服务暂不可用，请稍后重试" });
    });
  },
});
