import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup } from "../../../services/teacher-runtime.js";
Page({
  data: {
    navigation: buildNavigation("teacher", "profile"),
    notify: false,
    groupName: "",
    organizationName: "",
    roleLabel: "尚未授权",
  },
  async onShow() {
    try {
      const group = await selectedTeacherGroup();
      this.setData({
        groupName: group.name,
        organizationName: group.organizationName,
        roleLabel:
          group.role === "ORGANIZATION_ADMIN"
            ? "机构管理员"
            : group.role === "ASSISTANT"
              ? "助教"
              : "教师",
        notify: wx.getStorageSync("task_checkin_teacher_notify") === true,
      });
    } catch (error) {
      this.setData({ groupName: "", organizationName: "", roleLabel: "尚未授权" });
      showError(error);
    }
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) replace(event.detail.path);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  toggleNotify(event: { detail: { value: boolean } }) {
    this.setData({ notify: event.detail.value });
    wx.setStorageSync("task_checkin_teacher_notify", event.detail.value);
  },
});
