import { buildNavigation, buildTeacherWorkbench } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: {
    groupName: "三年级 2 班",
    navigation: buildNavigation("teacher", "home"),
    sections: buildTeacherWorkbench({ dueToday: 6, pendingReview: 4, revisionRequired: 2 })
      .sections,
    submissions: [
      {
        id: "assignment-1",
        label: "订正后再次提交",
        name: "晨曦 07",
        time: "10:24",
        title: "语文朗读",
      },
      {
        id: "assignment-2",
        label: "等待学习审核",
        name: "晨曦 12",
        time: "10:08",
        title: "数学练习",
      },
    ],
  },
  createTask() {
    navigate("/pages/teacher/task-editor/index");
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openGroup() {
    navigate("/pages/teacher/groups/index");
  },
  openReview(event: { readonly currentTarget: { readonly dataset: { readonly id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined) navigate(`/pages/teacher/review-detail/index?id=${id}`);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
});
