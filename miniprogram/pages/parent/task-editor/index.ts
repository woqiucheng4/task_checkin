import { coreApiClient } from "../../../services/page-runtime.js";

Page({
  data: {
    category: "LIFE",
    draftId: "",
    dueAt: "2026-09-05 20:00",
    mode: "MANUAL",
    submissionMode: "CONFIRM",
    title: "",
    uploaded: false,
  },
  chooseMode(event: { readonly currentTarget: { readonly dataset: { readonly mode?: string } } }) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== undefined) this.setData({ mode });
  },
  editTitle(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ title: event.detail.value ?? "" });
  },
  useTemplate(event: {
    readonly currentTarget: { readonly dataset: { readonly title?: string } };
  }) {
    this.setData({ mode: "MANUAL", title: event.currentTarget.dataset.title ?? "" });
  },
  async recognizePhoto() {
    const selected = await wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
    });
    if (selected.tempFiles[0] === undefined) return;
    this.setData({ mode: "OCR", uploaded: true, title: "完成数学练习册第 18 页" });
    wx.showToast({ icon: "none", title: "已生成草稿，请确认后发布" });
  },
  async publish() {
    if (String(this.data.title ?? "").trim().length === 0) {
      wx.showToast({ icon: "none", title: "请填写任务名称" });
      return;
    }
    const result = await coreApiClient.execute("PUBLISH_FAMILY_TASK", {
      allowLateSubmission: true,
      category: this.data.category,
      childIds: ["child-a"],
      dueAt: "2026-09-05T12:00:00.000Z",
      estimatedMinutes: 15,
      familyId: "family-1",
      importance: "REQUIRED",
      occurrenceDate: "2026-09-05",
      requiresAcademicReview: false,
      schedule: { date: "2026-09-05", kind: "ONCE" },
      startsAt: "2026-09-05T00:00:00.000Z",
      submissionMode: this.data.submissionMode,
      title: this.data.title,
    });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "任务已发布" : result.error.message,
    });
    if (result.ok) wx.navigateBack();
  },
});
