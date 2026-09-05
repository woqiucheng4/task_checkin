import { coreApiClient } from "../../../services/page-runtime.js";

Page({
  data: { mode: "MANUAL", requireReview: true, title: "", uploaded: false },
  chooseMode(event: { readonly currentTarget: { readonly dataset: { readonly mode?: string } } }) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== undefined) this.setData({ mode });
  },
  editTitle(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ title: event.detail.value ?? "" });
  },
  async recognizePhoto() {
    const selected = await wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
    });
    if (selected.tempFiles[0] !== undefined) {
      this.setData({ mode: "OCR", title: "朗读《秋天的雨》", uploaded: true });
      wx.showToast({ icon: "none", title: "草稿已生成，请确认" });
    }
  },
  async publish() {
    const title = String(this.data.title ?? "").trim();
    if (!title) {
      wx.showToast({ icon: "none", title: "请填写任务名称" });
      return;
    }
    const result = await coreApiClient.execute("PUBLISH_GROUP_TASK", {
      allowLateSubmission: true,
      category: "LANGUAGE",
      dueAt: "2026-09-05T12:00:00.000Z",
      estimatedMinutes: 15,
      groupId: "group-1",
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requiresAcademicReview: true,
      schedule: { date: "2026-09-05", kind: "ONCE" },
      startsAt: "2026-09-05T00:00:00.000Z",
      submissionMode: "CONFIRM",
      title,
    });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "任务已发布" : result.error.message,
    });
    if (result.ok) wx.navigateBack();
  },
});
