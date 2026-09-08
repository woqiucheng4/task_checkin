import { coreApiClient } from "../../../services/page-runtime.js";
import {
  selectedChild,
  selectedFamily,
  showError,
  today,
} from "../../../services/session-runtime.js";

Page({
  data: {
    category: "LIFE",
    draftId: "",
    dueAt: `${today()} 23:59`,
    date: today(),
    time: "23:59",
    publishing: false,
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
  editDate(event: { detail: { value: string } }) {
    this.setData({ date: event.detail.value, dueAt: `${event.detail.value} ${this.data.time}` });
  },
  editTime(event: { detail: { value: string } }) {
    this.setData({ time: event.detail.value, dueAt: `${this.data.date} ${event.detail.value}` });
  },
  editSubmissionMode(event: { detail: { value: string } }) {
    this.setData({ submissionMode: event.detail.value });
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
    wx.showToast({ icon: "none", title: "识别服务连接中，请先手动填写" });
  },
  async publish() {
    if (this.data.publishing) return;
    if (String(this.data.title ?? "").trim().length === 0) {
      wx.showToast({ icon: "none", title: "请填写任务名称" });
      return;
    }
    this.setData({ publishing: true });
    try {
      const family = await selectedFamily();
      const date = String(this.data.date);
      const dueAt = new Date(`${date}T${this.data.time}:00+08:00`).toISOString();
      const result = await coreApiClient.execute("PUBLISH_FAMILY_TASK", {
        allowLateSubmission: true,
        category: this.data.category,
        childIds: [await selectedChild()],
        dueAt,
        estimatedMinutes: 15,
        familyId: family.id,
        importance: "REQUIRED",
        occurrenceDate: date,
        requiresAcademicReview: false,
        schedule: { date, kind: "ONCE" },
        startsAt: new Date(`${date}T00:00:00+08:00`).toISOString(),
        submissionMode: this.data.submissionMode,
        title: this.data.title,
      });
      wx.showToast({
        icon: result.ok ? "success" : "none",
        title: result.ok ? "任务已发布" : result.error.message,
      });
      if (result.ok) wx.navigateBack();
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ publishing: false });
    }
  },
});
