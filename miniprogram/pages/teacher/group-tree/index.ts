import { buildGroupTreePage } from "../../../presentation/page-models.js";
import { command, showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup, teacherWorkspace } from "../../../services/teacher-runtime.js";
async function load(page: MiniPageInstance) {
  const view = await teacherWorkspace();
  page.setData({
    ...buildGroupTreePage({
      groupName: view.group.name,
      memberCount: view.members.length,
      progress: view.groupTree?.progress || 0,
      target: view.groupTree?.threshold || 10,
    }),
    treeId: view.groupTree?.id || "",
    mature: view.groupTree?.status === "MATURE",
  });
}
Page({
  data: {
    ...buildGroupTreePage({ groupName: "", memberCount: 0, progress: 0, target: 10 }),
    treeId: "",
    mature: false,
    working: false,
  },
  async onShow() {
    try {
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
  async startTree() {
    if (this.data.working || this.data.treeId) return;
    this.setData({ working: true });
    try {
      await command("START_GROUP_TREE", {
        groupId: (await selectedTeacherGroup()).id,
        catalogId: "starter-apple",
      });
      await load(this);
      wx.showToast({ icon: "success", title: "共育树已种下" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
  async harvest() {
    if (this.data.working || !this.data.mature) return;
    this.setData({ working: true });
    try {
      await command("HARVEST_GROUP_TREE", {
        groupTreeId: this.data.treeId,
        title: `${this.data.groupName}的共同收获`,
      });
      await load(this);
      wx.showToast({ icon: "success", title: "已保存共同收获" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
