import { navigate } from "../../../services/page-runtime.js";
import { command, selectedChild, showError } from "../../../services/session-runtime.js";
import type { SubmissionService } from "../../../../src/application/submission-service.js";
Page({
  data: { assignmentId: "", feedback: "", source: "", state: "pending", task: {}, images: [] },
  async onLoad(query: { id?: string }) {
    if (!query.id) return;
    this.setData({ assignmentId: query.id });
    try {
      const actor = { mode: "CHILD" as const, childId: await selectedChild() };
      const item = await command<Awaited<ReturnType<SubmissionService["detail"]>>>(
        "GET_ASSIGNMENT_DETAIL",
        { assignmentId: query.id },
        actor,
      );
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
      const images = await Promise.all(
        item.sourceAssetIds.map(async (assetId) => {
          const asset = await command<{ downloadUrl?: string }>(
            "READ_MEDIA_ASSET",
            { assetId },
            actor,
          );
          return asset.downloadUrl || "";
        }),
      );
      this.setData({ images: images.filter(Boolean) });
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
