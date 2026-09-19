import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { command, showError } from "../../../services/session-runtime.js";
import {
  teacherGroups,
  teacherWorkspaceOrganization,
  teacherWorkspace,
  selectTeacherGroup,
} from "../../../services/teacher-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
async function load(page: MiniPageInstance) {
  const workspace = await teacherWorkspaceOrganization();
  if (!workspace) {
    page.setData({ groups: [], selected: "", workspaceId: "", error: "请先激活教师工作空间" });
    replace("/pages/teacher/activation/index");
    return;
  }
  const groups = await teacherGroups();
  page.setData({ groups, workspaceId: workspace.id });
  if (!groups.length) {
    page.setData({
      selected: "",
      groupName: "",
      organizationName: workspace.name,
      memberCount: 0,
      pendingCount: 0,
      reviewCount: 0,
      current: 0,
      target: 0,
      error: "还没有学习小组，请新建分组后再邀请成员。",
    });
    return;
  }
  const view = await teacherWorkspace();
  const pending = await command<Awaited<ReturnType<PresentationService["groupJoinRequests"]>>>(
    "GET_GROUP_JOIN_REQUESTS",
    { groupId: view.group.id },
  );
  const submissions = await command<Awaited<ReturnType<PresentationService["groupSubmissions"]>>>(
    "GET_GROUP_SUBMISSIONS",
    { groupId: view.group.id },
  );
  page.setData({
    selected: view.group.id,
    groupName: view.group.name,
    organizationName: view.group.organizationName,
    memberCount: view.members.length,
    pendingCount: pending.length,
    reviewCount: submissions.filter(
      (row) => row.taskState === "SUBMITTED" && row.academicState === "PENDING",
    ).length,
    current: view.groupTree?.progress || 0,
    target: view.groupTree?.threshold || 0,
    error: "",
  });
}
Page({
  data: {
    navigation: buildNavigation("teacher", "groups"),
    groups: [],
    workspaceId: "",
    selected: "",
    groupName: "",
    organizationName: "",
    memberCount: 0,
    pendingCount: 0,
    reviewCount: 0,
    current: 0,
    target: 0,
    error: "",
    groupNameInput: "",
    creating: false,
  },
  async onShow() {
    try {
      await load(this);
    } catch (error) {
      this.setData({ selected: "", error: error instanceof Error ? error.message : "加载失败" });
      showError(error);
    }
  },
  invite() {
    if (this.data.selected) navigate("/pages/teacher/members/index");
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) replace(event.detail.path);
  },
  openMembers() {
    if (this.data.selected) navigate("/pages/teacher/members/index");
  },
  openTree() {
    if (this.data.selected) navigate("/pages/teacher/group-tree/index");
  },
  async selectGroup(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    try {
      await selectTeacherGroup(id);
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
  editGroupName(event: { detail: { value: string } }) {
    this.setData({ groupNameInput: event.detail.value });
  },
  async createGroup() {
    if (this.data.creating) return;
    const workspaceId = String(this.data.workspaceId || "");
    const name = String(this.data.groupNameInput || "").trim();
    if (!workspaceId) {
      this.setData({ error: "请先激活教师工作空间" });
      replace("/pages/teacher/activation/index");
      return;
    }
    if (!name) {
      this.setData({ error: "请填写分组名称" });
      return;
    }
    this.setData({ creating: true, error: "" });
    try {
      const group = await command<{ id: string; name: string }>("CREATE_GROUP", {
        organizationId: workspaceId,
        name,
        type: "LEARNING_GROUP",
      });
      await selectTeacherGroup(group.id);
      this.setData({ groupNameInput: "" });
      await load(this);
      wx.showToast({ icon: "success", title: "分组已创建" });
      navigate("/pages/teacher/members/index");
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "创建分组失败，请重试" });
      showError(error);
    } finally {
      this.setData({ creating: false });
    }
  },
});
