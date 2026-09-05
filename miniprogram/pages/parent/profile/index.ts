import { buildNavigation } from "../../../presentation/page-models.js";
import { coreApiClient, navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: { navigation: buildNavigation("parent", "profile"), notifications: true },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openGroups() {
    navigate("/pages/parent/groups/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  toggleNotifications(event: { readonly detail: { readonly value: boolean } }) {
    this.setData({ notifications: event.detail.value });
  },
  async requestExport() {
    const result = await coreApiClient.execute("REQUEST_EXPORT", {
      exportType: "FAMILY_DATA",
      familyId: "family-1",
    });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "导出申请已提交" : result.error.message,
    });
  },
});
