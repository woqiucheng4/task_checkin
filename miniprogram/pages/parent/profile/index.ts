import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { command, selectedFamily, showError } from "../../../services/session-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";

Page({
  data: {
    navigation: buildNavigation("parent", "profile"),
    notifications: false,
    familyName: "",
    childCount: 0,
    memberCount: 0,
    members: [],
    rewards: {},
    roleLabel: "",
  },
  async onShow() {
    try {
      const family = await selectedFamily();
      const view = await command<Awaited<ReturnType<PresentationService["familySettings"]>>>(
        "GET_FAMILY_SETTINGS",
        { familyId: family.id },
      );
      this.setData({
        familyName: view.name,
        childCount: view.childCount,
        memberCount: view.members.length,
        members: view.members.map((member) => ({
          ...member,
          label: member.role === "FAMILY_ADMIN" ? "家庭管理员" : "监护人",
        })),
        rewards: view.defaultRewards,
        roleLabel: view.role === "FAMILY_ADMIN" ? "家庭管理员" : "监护人",
        notifications: wx.getStorageSync("task_checkin_notification_preference") === true,
      });
    } catch (error) {
      showError(error);
    }
  },
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
    wx.setStorageSync("task_checkin_notification_preference", event.detail.value);
  },
});
