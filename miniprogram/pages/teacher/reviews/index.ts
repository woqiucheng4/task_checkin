import { navigate } from "../../../services/page-runtime.js";
import { command, showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup } from "../../../services/teacher-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
type Rows = Awaited<ReturnType<PresentationService["groupSubmissions"]>>;
function filterRows(page: MiniPageInstance, filter: string) {
  const rows = page.data.allItems as Rows;
  const matches = (row: Rows[number]) =>
    filter === "PENDING"
      ? row.taskState === "SUBMITTED" && row.academicState === "PENDING"
      : filter === "REVISION"
        ? row.academicState === "REVISION_REQUIRED"
        : row.academicState === "APPROVED" ||
          row.academicState === "EXCUSED" ||
          (row.academicState === "NOT_REQUIRED" &&
            ["SUBMITTED", "COMPLETED"].includes(row.taskState));
  page.setData({
    filter,
    items: rows.filter(matches).map((row) => ({
      ...row,
      status:
        filter === "PENDING"
          ? "待学习审核"
          : filter === "REVISION"
            ? "待孩子订正"
            : "已完成学习评价",
      time: row.submittedAt
        ? new Date(Date.parse(row.submittedAt) + 8 * 3600000)
            .toISOString()
            .slice(0, 16)
            .replace("T", " ")
        : "尚未提交",
    })),
  });
}
Page({
  data: { filter: "PENDING", items: [], allItems: [], taskId: "", groupName: "", error: "" },
  onLoad(query: { task?: string }) {
    this.setData({ taskId: query.task || "" });
  },
  async onShow() {
    try {
      const group = await selectedTeacherGroup();
      const rows = await command<Rows>("GET_GROUP_SUBMISSIONS", {
        groupId: group.id,
        ...(this.data.taskId ? { taskId: this.data.taskId } : {}),
      });
      this.setData({ allItems: rows, groupName: group.name, error: "" });
      filterRows(this, String(this.data.filter));
    } catch (error) {
      this.setData({
        allItems: [],
        items: [],
        error: error instanceof Error ? error.message : "加载失败",
      });
      showError(error);
    }
  },
  chooseFilter(event: { currentTarget: { dataset: { filter?: string } } }) {
    if (event.currentTarget.dataset.filter) filterRows(this, event.currentTarget.dataset.filter);
  },
  open(event: { currentTarget: { dataset: { id?: string } } }) {
    if (event.currentTarget.dataset.id)
      navigate(`/pages/teacher/review-detail/index?id=${event.currentTarget.dataset.id}`);
  },
});
