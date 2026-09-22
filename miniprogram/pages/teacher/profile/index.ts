import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { accountShell, command, showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup } from "../../../services/teacher-runtime.js";
import { uploadAccountAvatar } from "../../../services/upload-account-avatar.js";
Page({
  data: {
    navigation: buildNavigation("teacher", "profile"),
    notify: false,
    groupName: "",
    organizationName: "",
    roleLabel: "尚未授权",
    accountNickname: "",
    accountAvatarUrl: "",
    pendingAccountAvatarUrl: "",
    savingAccountProfile: false,
  },
  async onShow() {
    try {
      const [group, shell] = await Promise.all([selectedTeacherGroup(), accountShell(true)]);
      const avatar = shell.account.avatarAssetId
        ? await command<{ downloadUrl?: string }>("READ_MEDIA_ASSET", {
            assetId: shell.account.avatarAssetId,
          })
        : {};
      this.setData({
        groupName: group.name,
        organizationName: group.organizationName,
        roleLabel:
          group.role === "ORGANIZATION_ADMIN"
            ? "机构管理员"
            : group.role === "ASSISTANT"
              ? "助教"
              : "教师",
        accountNickname: shell.account.displayName || "",
        accountAvatarUrl: avatar.downloadUrl || "",
        pendingAccountAvatarUrl: "",
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
  editAccountNickname(event: { detail: { value: string } }) {
    this.setData({ accountNickname: event.detail.value });
  },
  chooseAccountAvatar(event: { detail: { avatarUrl?: string } }) {
    const avatarUrl = String(event.detail.avatarUrl || "");
    if (avatarUrl)
      this.setData({ accountAvatarUrl: avatarUrl, pendingAccountAvatarUrl: avatarUrl });
  },
  async saveAccountProfile() {
    if (this.data.savingAccountProfile) return;
    const displayName = String(this.data.accountNickname || "").trim();
    const avatarUrl = String(this.data.pendingAccountAvatarUrl || "");
    if (!displayName && !avatarUrl) return showError(new Error("请填写昵称或选择头像"));
    this.setData({ savingAccountProfile: true });
    try {
      const avatarAssetId = avatarUrl ? await uploadAccountAvatar(avatarUrl) : undefined;
      await command("UPDATE_ACCOUNT_PROFILE", {
        ...(displayName ? { displayName } : {}),
        ...(avatarAssetId ? { avatarAssetId } : {}),
      });
      await accountShell(true);
      this.setData({ accountNickname: displayName, pendingAccountAvatarUrl: "" });
      wx.showToast({ icon: "success", title: "账号资料已保存" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ savingAccountProfile: false });
    }
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  toggleNotify(event: { detail: { value: boolean } }) {
    this.setData({ notify: event.detail.value });
    wx.setStorageSync("task_checkin_teacher_notify", event.detail.value);
  },
});
