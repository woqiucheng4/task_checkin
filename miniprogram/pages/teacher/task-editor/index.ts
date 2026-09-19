import { command, today, showError } from "../../../services/session-runtime.js";
import { selectedTeacherGroup } from "../../../services/teacher-runtime.js";
import { uploadTaskSource } from "../../../services/upload-task-source.js";
import type { PresentationService } from "../../../../src/application/presentation-service.js";
import type { CommandResult } from "../../../../src/shared/result.js";
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

async function chooseImageBase64(): Promise<string | undefined> {
  const selected = await wx.chooseMedia({
    count: 1,
    mediaType: ["image"],
    sourceType: ["album", "camera"],
  });
  const filePath = selected.tempFiles[0]?.tempFilePath;
  if (!filePath) return undefined;
  return wx.getFileSystemManager().readFileSync(filePath, "base64");
}

function editorDate(instant: string | undefined, fallback: string): { date: string; time: string } {
  if (!instant) return { date: fallback, time: "23:59" };
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return { date: fallback, time: "23:59" };
  const local = new Date(parsed.getTime() + 8 * 3600000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

const teacherClient = {
  async execute(
    action: Parameters<typeof command>[0],
    payload: Readonly<Record<string, unknown>>,
  ): Promise<CommandResult<unknown>> {
    try {
      return { ok: true as const, data: await command(action, payload) };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: error instanceof Error ? error.message : "请求失败，请重试",
        },
      };
    }
  },
};
Page({
  data: {
    mode: "OCR",
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
    startsDate: today(),
    startsTime: "00:00",
    submissionMode: "CONFIRM",
    working: false,
    draftId: "",
    confidence: "",
    sourceAssetIds: [] as readonly string[],
    uploadingImage: false,
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
      requireReview: true,
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
  editStartsDate(event: { detail: { value: string } }) {
    this.setData({ startsDate: event.detail.value });
  },
  editStartsTime(event: { detail: { value: string } }) {
    this.setData({ startsTime: event.detail.value });
  },
  async recognizePhoto() {
    const sourceAssetIds = this.data.sourceAssetIds as readonly string[];
    if (this.data.working || this.data.uploadingImage === true || sourceAssetIds.length >= 3) {
      if (sourceAssetIds.length >= 3) wx.showToast({ icon: "none", title: "最多上传 3 张图片" });
      return;
    }
    this.setData({ uploadingImage: true });
    try {
      const group = await selectedTeacherGroup();
      if (!group.organizationId) throw new Error("请先激活教师工作空间并选择学习小组");
      const base64 = await chooseImageBase64();
      if (!base64) return;
      const assetId = await uploadTaskSource(
        teacherClient,
        { kind: "ORGANIZATION", organizationId: group.organizationId },
        base64,
      );
      this.setData({ sourceAssetIds: [...sourceAssetIds, assetId] });
      const draft = await command<{
        id: string;
        title?: string;
        description?: string;
        category?: string;
        dueAt?: string;
        startsAt?: string;
        submissionMode?: string;
        confidence?: number;
      }>("RECOGNIZE_TASK_DRAFT", { assetId });
      const deadline = editorDate(draft.dueAt, String(this.data.date));
      const starts = draft.startsAt
        ? editorDate(draft.startsAt, String(this.data.startsDate))
        : undefined;
      const categoryIndex = categories.findIndex((item) => item.value === draft.category);
      this.setData({
        category: draft.category ?? this.data.category,
        categoryIndex: categoryIndex >= 0 ? categoryIndex : this.data.categoryIndex,
        confidence:
          typeof draft.confidence === "number"
            ? `识别置信度 ${Math.round(draft.confidence * 100)}%，请逐项确认`
            : "识别结果仅供参考，请逐项确认",
        date: deadline.date,
        ...(starts ? { startsDate: starts.date, startsTime: starts.time } : {}),
        description: draft.description ?? this.data.description,
        draftId: draft.id,
        mode: "MANUAL",
        submissionMode: draft.submissionMode ?? this.data.submissionMode,
        time: deadline.time,
        title: draft.title ?? this.data.title,
      });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ uploadingImage: false });
    }
  },
  async publish() {
    if (this.data.working || this.data.uploadingImage) return;
    const title = String(this.data.title || "").trim();
    if (!title) {
      wx.showToast({ icon: "none", title: "请填写任务名称" });
      return;
    }
    this.setData({ working: true });
    const snapshot: Record<string, unknown> = {
      ...this.data,
      sourceAssetIds: [...(this.data.sourceAssetIds as readonly string[])],
    };
    try {
      const group = await selectedTeacherGroup();
      const date = String(snapshot.date);
      const fields = {
        category: snapshot.category,
        description: String(snapshot.description || ""),
        dueAt: new Date(`${date}T${snapshot.time}:00+08:00`).toISOString(),
        startsAt: new Date(`${snapshot.startsDate}T${snapshot.startsTime}:00+08:00`).toISOString(),
        submissionMode: snapshot.submissionMode,
        title,
      };
      if (snapshot.draftId) {
        await command("EDIT_TASK_DRAFT", { draftId: snapshot.draftId, ...fields });
        await command("PUBLISH_TASK_DRAFT", {
          allowLateSubmission: snapshot.allowLateSubmission === true,
          draftId: snapshot.draftId,
          estimatedMinutes: snapshot.estimatedMinutes,
          groupId: group.id,
          importance: snapshot.importance,
          occurrenceDate: date,
          requiresAcademicReview: true,
          schedule: { date, kind: "ONCE" },
          sourceAssetIds: snapshot.sourceAssetIds,
        });
      } else
        await command("PUBLISH_GROUP_TASK", {
          allowLateSubmission: snapshot.allowLateSubmission === true,
          ...fields,
          estimatedMinutes: snapshot.estimatedMinutes,
          groupId: group.id,
          importance: snapshot.importance,
          occurrenceDate: date,
          requiresAcademicReview: true,
          schedule: { date, kind: "ONCE" },
          sourceAssetIds: snapshot.sourceAssetIds,
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
