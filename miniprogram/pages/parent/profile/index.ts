import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import {
  accountShell,
  command,
  selectedFamily,
  showError,
} from "../../../services/session-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";

Page({
  data: {
    navigation: buildNavigation("parent", "profile"),
    notifications: false,
    loading: true,
    familyId: "",
    familyName: "",
    childNickname: "",
    addingChild: false,
    createdChildId: "",
    childNotice: "",
    childCount: 0,
    memberCount: 0,
    members: [],
    rewards: {},
    roleLabel: "",
  },
  async onShow() {
    this.setData({ loading: true, familyId: "" });
    try {
      const family = await selectedFamily();
      const view = await command<Awaited<ReturnType<PresentationService["familySettings"]>>>(
        "GET_FAMILY_SETTINGS",
        { familyId: family.id },
      );
      this.setData({
        familyId: family.id,
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
    } finally {
      this.setData({ loading: false });
    }
  },
  editChildNickname(event: { detail: { value: string } }) {
    this.setData({ childNickname: event.detail.value });
  },
  async addChild() {
    if (this.data.loading || this.data.addingChild || !this.data.familyId) return;
    const nickname = String(this.data.childNickname).trim();
    if (!this.data.createdChildId && !nickname) return showError(new Error("请填写孩子昵称"));
    this.setData({ addingChild: true, childNotice: "" });
    try {
      if (!this.data.createdChildId) {
        const child = await command<{ id: string }>("ADD_CHILD", {
          familyId: String(this.data.familyId),
          nickname,
        });
        this.setData({ createdChildId: child.id, childNickname: "" });
      }
      await accountShell(true);
      this.setData({ createdChildId: "" });
      replace("/pages/parent/home/index");
    } catch (error) {
      this.setData({
        childNotice: this.data.createdChildId
          ? "孩子已添加，刷新后即可在首页选择"
          : error instanceof Error
            ? error.message
            : "添加失败，请重试",
      });
      showError(error);
    } finally {
      this.setData({ addingChild: false });
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
