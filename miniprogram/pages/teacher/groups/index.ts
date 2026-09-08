import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { command, showError } from "../../../services/session-runtime.js";
import {
  teacherGroups,
  teacherWorkspace,
  selectTeacherGroup,
} from "../../../services/teacher-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
async function load(page: MiniPageInstance) {
  const groups = await teacherGroups();
  page.setData({ groups });
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
    selected: "",
    groupName: "",
    organizationName: "",
    memberCount: 0,
    pendingCount: 0,
    reviewCount: 0,
    current: 0,
    target: 0,
    error: "",
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
});
