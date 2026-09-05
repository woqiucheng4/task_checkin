import { childFixtures } from "../../../presentation/fixtures.js";
import { buildChildTodayPage } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

const page = buildChildTodayPage(childFixtures.ready);

Page({
  data: page,
  activateTask(event: { readonly detail: { readonly assignmentId?: string } }) {
    const assignmentId = event.detail.assignmentId;
    if (assignmentId !== undefined) navigate(`/pages/child/task/index?id=${assignmentId}`);
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  retry() {
    this.setData(buildChildTodayPage(childFixtures.ready));
  },
});
