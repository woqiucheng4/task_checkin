import { command, showError } from "../../../services/session-runtime.js";
import type { SubmissionService } from "../../../../src/application/submission-service.js";
async function review(page: MiniPageInstance, decision: string) {
  if (page.data.working || !page.data.canReview) return;
  page.setData({ working: true });
  try {
    await command("FAMILY_REVIEW", {
      assignmentId: page.data.assignmentId,
      decision,
      note: page.data.note,
    });
    wx.showToast({
      icon: "success",
      title: decision === "APPROVE" ? "已确认完成" : "已保存审核结果",
    });
    wx.navigateBack();
  } catch (error) {
    showError(error);
  } finally {
    page.setData({ working: false });
  }
}
Page({
  data: {
    assignmentId: "",
    note: "",
    source: "FAMILY",
    title: "",
    childLabel: "",
    state: "",
    working: false,
    canReview: false,
    submissionText: "",
    images: [],
    academicLabel: "",
  },
  async onLoad(query: { id?: string }) {
    if (!query.id) return;
    this.setData({ assignmentId: query.id });
    try {
      const task = await command<Awaited<ReturnType<SubmissionService["detail"]>>>(
        "GET_ASSIGNMENT_DETAIL",
        { assignmentId: query.id },
      );
      const images = await Promise.all(
        (task.submission?.mediaAssetIds ?? []).map(async (assetId) => {
          const asset = await command<{ downloadUrl?: string }>("READ_MEDIA_ASSET", { assetId });
          return asset.downloadUrl || "";
        }),
      );
      this.setData({
        title: task.title,
        childLabel: task.childLabel,
        source: task.source,
        state: task.taskState,
        submissionText:
          task.submission?.text || (task.submission ? "孩子已确认完成" : "孩子尚未提交"),
        images: images.filter(Boolean),
        canReview:
          task.source === "FAMILY" &&
          task.taskState === "SUBMITTED" &&
          task.rewardState !== "GRANTED" &&
          task.rewardState !== "WAIVED",
        academicLabel:
          (
            {
              NOT_REQUIRED: "无需老师审核",
              PENDING: "等待老师审核",
              APPROVED: "老师已通过",
              REVISION_REQUIRED: "老师要求订正",
              EXCUSED: "已免除",
            } as Record<string, string>
          )[task.academicState] || task.academicState,
      });
    } catch (error) {
      showError(error);
    }
  },
  editNote(event: { detail: { value?: string } }) {
    this.setData({ note: event.detail.value || "" });
  },
  approve() {
    void review(this, "APPROVE");
  },
  revise() {
    void review(this, "REVISION_REQUIRED");
  },
  waive() {
    void review(this, "WAIVE");
  },
});
