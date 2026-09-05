import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: { navigation: buildNavigation("teacher", "profile"), notify: true },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  toggleNotify(event: { readonly detail: { readonly value: boolean } }) {
    this.setData({ notify: event.detail.value });
  },
});
