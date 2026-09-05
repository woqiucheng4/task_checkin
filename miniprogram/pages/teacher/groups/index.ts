import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: { navigation: buildNavigation("teacher", "groups"), selected: "group-1" },
  invite() {
    navigate("/pages/teacher/members/index?invite=1");
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openMembers() {
    navigate("/pages/teacher/members/index");
  },
  openTree() {
    navigate("/pages/teacher/group-tree/index");
  },
  selectGroup(event: { readonly currentTarget: { readonly dataset: { readonly id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined) this.setData({ selected: id });
  },
});
