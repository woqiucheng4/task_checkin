import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { dashboard, command, selectedChild, showError } from "../../../services/session-runtime.js";
import type { OrchardView } from "../../../../src/application/orchard-service.js";

Page({
  data: {
    density: "LOWER_PRIMARY",
    nickname: "",
    grade: 0,
    fruitCount: 0,
    navigation: buildNavigation("child", "profile"),
  },
  async onShow() {
    try {
      const home = await dashboard();
      const orchard = await command<OrchardView>(
        "GET_CHILD_ORCHARD",
        {},
        { mode: "CHILD", childId: await selectedChild() },
      );
      this.setData({
        nickname: home.selectedChild.nickname,
        grade: home.selectedChild.grade || 0,
        fruitCount: orchard.fruits.reduce((sum, fruit) => sum + fruit.quantity, 0),
        density: wx.getStorageSync("task_checkin_density") || "LOWER_PRIMARY",
      });
    } catch (error) {
      showError(error);
    }
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  switchDensity(event: { readonly detail: { readonly value: boolean } }) {
    this.setData({ density: event.detail.value ? "UPPER_PRIMARY" : "LOWER_PRIMARY" });
    wx.setStorageSync("task_checkin_density", this.data.density);
  },
});
