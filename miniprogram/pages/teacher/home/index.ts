import { buildNavigation, buildTeacherWorkbench } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { command, today, showError } from "../../../services/session-runtime.js";
import {
  selectedTeacherGroup,
  teacherWorkspace,
  teacherWorkspaceOrganization,
} from "../../../services/teacher-runtime.js";
import type { TeacherDashboardView } from "../../../../src/application/presentation-models.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
Page({
  data: {
    groupName: "",
    date: today(),
    navigation: buildNavigation("teacher", "home"),
    sections: [],
    submissions: [],
    deadlines: [],
    error: "",
    loading: true,
  },
  async onShow() {
    this.setData({ loading: true, error: "" });
    try {
      if (!(await teacherWorkspaceOrganization())) {
        replace("/pages/teacher/activation/index");
        return;
      }
      const group = await selectedTeacherGroup();
      const dashboard = await command<TeacherDashboardView>("GET_TEACHER_DASHBOARD", {
        date: today(),
      });
      const rows = await command<Awaited<ReturnType<PresentationService["groupSubmissions"]>>>(
        "GET_GROUP_SUBMISSIONS",
        { groupId: group.id },
      );
      const workspace = await teacherWorkspace();
      this.setData({
        groupName: group.name,
        date: today(),
        sections: buildTeacherWorkbench(dashboard.metrics).sections,
        submissions: rows
          .filter((row) => row.taskState === "SUBMITTED" && row.academicState === "PENDING")
          .map((row) => ({
            ...row,
            label: "等待学习审核",
            time: row.submittedAt
              ? new Date(Date.parse(row.submittedAt) + 8 * 3600000).toISOString().slice(11, 16)
              : "",
          })),
        deadlines: workspace.tasks
          .filter(
            (task) =>
              task.status === "PUBLISHED" &&
              new Date(Date.parse(task.dueAt) + 8 * 3600000).toISOString().slice(0, 10) === today(),
          )
          .map((task) => ({
            ...task,
            time: new Date(Date.parse(task.dueAt) + 8 * 3600000).toISOString().slice(11, 16),
          })),
      });
    } catch (error) {
      this.setData({
        submissions: [],
        deadlines: [],
        error: error instanceof Error ? error.message : "加载失败",
      });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  createTask() {
    navigate("/pages/teacher/task-editor/index");
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) replace(event.detail.path);
  },
  openGroup() {
    navigate("/pages/teacher/groups/index");
  },
  openReview(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    navigate(id ? `/pages/teacher/review-detail/index?id=${id}` : "/pages/teacher/reviews/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
});
