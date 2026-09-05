import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: {
    density: "LOWER_PRIMARY",
    navigation: buildNavigation("child", "profile"),
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openGroup() {
    navigate("/pages/child/group/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  switchDensity(event: { readonly detail: { readonly value: boolean } }) {
    this.setData({ density: event.detail.value ? "UPPER_PRIMARY" : "LOWER_PRIMARY" });
  },
});
