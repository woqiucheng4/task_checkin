import { command, today, showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup } from "../../../services/teacher-runtime.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
type Template = Awaited<ReturnType<PresentationService["groupTaskTemplates"]>>[number];
const categories = [
  { value: "LIFE", label: "生活" },
  { value: "LANGUAGE", label: "语文" },
  { value: "MATHEMATICS", label: "数学" },
  { value: "ENGLISH", label: "英语" },
  { value: "SCIENCE", label: "科学" },
  { value: "ART", label: "艺术" },
  { value: "SPORT", label: "运动" },
  { value: "OTHER", label: "其他" },
];
Page({
  data: {
    mode: "MANUAL",
    categories,
    category: "LANGUAGE",
    categoryIndex: 1,
    templates: [],
    templatesLoading: false,
    templatesError: "",
    selectedTemplate: "",
    estimatedMinutes: 15,
    importance: "REQUIRED",
    allowLateSubmission: true,
    requireReview: true,
    title: "",
    description: "",
    groupName: "",
    date: today(),
    time: "23:59",
    submissionMode: "CONFIRM",
    working: false,
  },
  async onLoad() {
    try {
      const group = await selectedTeacherGroup();
      this.setData({ groupName: group.name, date: today() });
    } catch (error) {
      showError(error);
    }
  },
  async chooseMode(event: { currentTarget: { dataset: { mode?: string } } }) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || !["MANUAL", "TEMPLATE", "OCR"].includes(mode)) return;
    this.setData({ mode });
    if (mode !== "TEMPLATE") return;
    this.setData({ templatesLoading: true, templatesError: "", templates: [] });
    try {
      const group = await selectedTeacherGroup();
      const templates = await command<Template[]>("GET_GROUP_TASK_TEMPLATES", {
        groupId: group.id,
      });
      this.setData({ templates });
    } catch (error) {
      this.setData({
        templatesError: error instanceof Error ? error.message : "模板加载失败，请重试",
      });
    } finally {
      this.setData({ templatesLoading: false });
    }
  },
  useTemplate(event: { currentTarget: { dataset: { id?: string } } }) {
    const template = (this.data.templates as Template[]).find(
      (item) => item.id === event.currentTarget.dataset.id,
    );
    if (!template) return;
    this.setData({
      selectedTemplate: template.id,
      title: template.title,
      description: template.description,
      category: template.category,
      categoryIndex: categories.findIndex((item) => item.value === template.category),
      estimatedMinutes: template.estimatedMinutes,
      importance: template.importance,
      submissionMode: template.submissionMode,
      allowLateSubmission: template.allowLateSubmission,
      requireReview: template.requiresAcademicReview,
    });
  },
  editCategory(event: { detail: { value: string } }) {
    const index = Number(event.detail.value);
    const category = categories[index];
    if (category) this.setData({ categoryIndex: index, category: category.value });
  },
  editTitle(event: { detail: { value?: string } }) {
    this.setData({ title: event.detail.value || "" });
  },
  editDescription(event: { detail: { value?: string } }) {
    this.setData({ description: event.detail.value || "" });
  },
  editDate(event: { detail: { value: string } }) {
    this.setData({ date: event.detail.value });
  },
  editTime(event: { detail: { value: string } }) {
    this.setData({ time: event.detail.value });
  },
  editSubmissionMode(event: { detail: { value: string } }) {
    this.setData({ submissionMode: event.detail.value });
  },
  editReview(event: { detail: { value: boolean } }) {
    this.setData({ requireReview: event.detail.value });
  },
  recognizePhoto() {
    wx.showToast({ icon: "none", title: "识别服务尚未配置，请手动填写" });
  },
  async publish() {
    if (this.data.working) return;
    const title = String(this.data.title || "").trim();
    if (!title) {
      wx.showToast({ icon: "none", title: "请填写任务名称" });
      return;
    }
    this.setData({ working: true });
    try {
      const group = await selectedTeacherGroup();
      const date = String(this.data.date);
      await command("PUBLISH_GROUP_TASK", {
        allowLateSubmission: this.data.allowLateSubmission === true,
        category: this.data.category,
        description: String(this.data.description || ""),
        dueAt: new Date(`${date}T${this.data.time}:00+08:00`).toISOString(),
        estimatedMinutes: this.data.estimatedMinutes,
        groupId: group.id,
        importance: this.data.importance,
        occurrenceDate: date,
        requiresAcademicReview: this.data.requireReview === true,
        schedule: { date, kind: "ONCE" },
        startsAt: new Date(`${date}T00:00:00+08:00`).toISOString(),
        submissionMode: this.data.submissionMode,
        title,
      });
      wx.showToast({ icon: "success", title: "任务已发布" });
      wx.navigateBack();
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
