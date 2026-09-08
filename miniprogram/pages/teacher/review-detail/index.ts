import { command, showError } from "../../../services/session-runtime.js";
import type { SubmissionService } from "../../../../src/application/submission-service.js";
async function review(page: MiniPageInstance, decision: "APPROVE" | "REVISION_REQUIRED") {
  if (page.data.working || !page.data.canReview) return;
  const note = String(page.data.note || "").trim();
  if (decision === "REVISION_REQUIRED" && !note) {
    wx.showToast({ icon: "none", title: "请填写具体订正建议" });
    return;
  }
  page.setData({ working: true });
  try {
    await command("ACADEMIC_REVIEW", {
      assignmentId: page.data.assignmentId,
      decision,
      ...(note ? { note } : {}),
    });
    wx.showToast({
      icon: "success",
      title: decision === "APPROVE" ? "学习评价已通过" : "已发出订正要求",
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
    title: "",
    childLabel: "",
    submissionText: "",
    images: [],
    canReview: false,
    working: false,
    submittedAt: "",
  },
  async onLoad(query: { id?: string }) {
    if (!query.id) return;
    this.setData({ assignmentId: query.id });
    try {
      const detail = await command<Awaited<ReturnType<SubmissionService["detail"]>>>(
        "GET_ASSIGNMENT_DETAIL",
        { assignmentId: query.id },
      );
      const images = await Promise.all(
        (detail.submission?.mediaAssetIds || []).map(
          async (assetId) =>
            (await command<{ downloadUrl?: string }>("READ_MEDIA_ASSET", { assetId }))
              .downloadUrl || "",
        ),
      );
      this.setData({
        title: detail.title,
        childLabel: detail.childLabel,
        submissionText:
          detail.submission?.text || (detail.submission ? "孩子已确认完成" : "尚未提交"),
        images: images.filter(Boolean),
        submittedAt: detail.submission?.submittedAt || "",
        canReview:
          detail.source !== "FAMILY" &&
          detail.taskState === "SUBMITTED" &&
          detail.academicState === "PENDING",
      });
    } catch (error) {
      showError(error);
    }
  },
  editNote(event: { detail: { value?: string } }) {
    this.setData({ note: event.detail.value || "" });
  },
  async approve() {
    await review(this, "APPROVE");
  },
  async revise() {
    await review(this, "REVISION_REQUIRED");
  },
});
