import { navigate } from "../../../services/page-runtime.js";
import { taskDetail, showError } from "../../../services/session-runtime.js";
Page({
  data: { assignmentId: "", feedback: "", source: "", state: "pending", task: {} },
  async onLoad(query: { id?: string }) {
    if (!query.id) return;
    this.setData({ assignmentId: query.id });
    try {
      const item = await taskDetail(query.id);
      this.setData({
        source: item.source === "FAMILY" ? "家庭" : "共育分组",
        state:
          item.taskState === "PENDING"
            ? "pending"
            : item.taskState === "REVISION_REQUIRED"
              ? "revision"
              : "submitted",
        task: {
          title: item.title,
          description: item.description || "",
          category: item.category,
          due: item.dueAt,
          mode: item.submissionMode,
          reward: "完成并经家长确认后，按家庭规则获得阳光",
        },
      });
    } catch (error) {
      showError(error);
    }
  },
  openSubmit() {
    navigate(`/pages/child/submit/index?id=${this.data.assignmentId}`);
  },
  revise() {
    navigate(`/pages/child/submit/index?id=${this.data.assignmentId}&revision=1`);
  },
});
