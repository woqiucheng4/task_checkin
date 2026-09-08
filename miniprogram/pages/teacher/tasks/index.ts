import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { showError } from "../../../services/session-runtime.js";
import { teacherWorkspace } from "../../../services/teacher-runtime.js";
Page({
  data: {
    navigation: buildNavigation("teacher", "tasks"),
    tasks: [],
    groupName: "",
    activeCount: 0,
    completedCount: 0,
    error: "",
  },
  async onShow() {
    try {
      const view = await teacherWorkspace();
      const tasks = view.tasks.map((task) => ({
        ...task,
        statusLabel:
          task.status === "PUBLISHED"
            ? "进行中"
            : task.status === "CANCELLED"
              ? "已取消"
              : "已归档",
        due: new Date(Date.parse(task.dueAt) + 8 * 3600000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
        completed: task.completedCount,
        total: task.assignmentCount,
        percent: task.assignmentCount
          ? Math.round((task.completedCount / task.assignmentCount) * 100)
          : 0,
      }));
      this.setData({
        groupName: view.group.name,
        tasks,
        activeCount: view.tasks.filter((task) => task.status === "PUBLISHED").length,
        completedCount: view.tasks.reduce((sum, task) => sum + task.completedCount, 0),
        error: "",
      });
    } catch (error) {
      this.setData({ tasks: [], error: error instanceof Error ? error.message : "加载失败" });
      showError(error);
    }
  },
  create() {
    navigate("/pages/teacher/task-editor/index");
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) replace(event.detail.path);
  },
  openReviews(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id) navigate(`/pages/teacher/reviews/index?task=${id}`);
  },
});
