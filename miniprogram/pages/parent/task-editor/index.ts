import { coreApiClient } from "../../../services/page-runtime.js";
import { uploadTaskSource } from "../../../services/upload-task-source.js";
import {
  selectedChild,
  selectedFamily,
  showError,
  today,
} from "../../../services/session-runtime.js";

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
    category: "LIFE",
    categories,
    categoryIndex: 0,
    confidence: "",
    description: "",
    draftId: "",
    dueAt: `${today()} 23:59`,
    date: today(),
    time: "23:59",
    startsDate: today(),
    startsTime: "00:00",
    publishing: false,
    mode: "OCR",
    submissionMode: "CONFIRM",
    title: "",
    uploaded: false,
    uploadingImage: false,
    sourceAssetIds: [] as readonly string[],
  },
  chooseMode(event: { readonly currentTarget: { readonly dataset: { readonly mode?: string } } }) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== undefined) this.setData({ mode });
  },
  editTitle(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ title: event.detail.value ?? "" });
  },
  editDescription(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ description: event.detail.value ?? "" });
  },
  editCategory(event: { readonly detail: { readonly value: string } }) {
    const index = Number(event.detail.value);
    const category = categories[index];
    if (category) this.setData({ category: category.value, categoryIndex: index });
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
  editStartsDate(event: { detail: { value: string } }) {
    this.setData({ startsDate: event.detail.value });
  },
  editStartsTime(event: { detail: { value: string } }) {
    this.setData({ startsTime: event.detail.value });
  },
  useTemplate(event: {
    readonly currentTarget: { readonly dataset: { readonly title?: string } };
  }) {
    this.setData({ mode: "MANUAL", title: event.currentTarget.dataset.title ?? "" });
  },
  async recognizePhoto() {
    const sourceAssetIds = this.data.sourceAssetIds as readonly string[];
    if (this.data.publishing || this.data.uploadingImage === true || sourceAssetIds.length >= 3) {
      if (sourceAssetIds.length >= 3) wx.showToast({ icon: "none", title: "最多上传 3 张图片" });
      return;
    }
    this.setData({ uploadingImage: true });
    try {
      const base64 = await chooseImageBase64();
      if (!base64) return;
      const family = await selectedFamily();
      const assetId = await uploadTaskSource(
        coreApiClient,
        { kind: "FAMILY", familyId: family.id },
        base64,
      );
      this.setData({ sourceAssetIds: [...sourceAssetIds, assetId] });
      const result = await coreApiClient.execute("RECOGNIZE_TASK_DRAFT", { assetId });
      if (!result.ok) throw new Error(result.error.message);
      const draft = result.data as {
        id: string;
        title?: string;
        description?: string;
        category?: string;
        dueAt?: string;
        startsAt?: string;
        submissionMode?: string;
        confidence?: number;
      };
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
        uploaded: true,
      });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ uploadingImage: false });
    }
  },
  async publish() {
    if (this.data.publishing || this.data.uploadingImage) return;
    if (String(this.data.title ?? "").trim().length === 0) {
      wx.showToast({ icon: "none", title: "请填写任务名称" });
      return;
    }
    this.setData({ publishing: true });
    const snapshot: Record<string, unknown> = {
      ...this.data,
      sourceAssetIds: [...(this.data.sourceAssetIds as readonly string[])],
    };
    try {
      const [family, childId] = await Promise.all([selectedFamily(), selectedChild()]);
      const date = String(snapshot.date);
      const dueAt = new Date(`${date}T${snapshot.time}:00+08:00`).toISOString();
      const fields = {
        category: snapshot.category,
        description: snapshot.description,
        dueAt,
        startsAt: new Date(`${snapshot.startsDate}T${snapshot.startsTime}:00+08:00`).toISOString(),
        submissionMode: snapshot.submissionMode,
        title: snapshot.title,
      };
      const result = snapshot.draftId
        ? await coreApiClient.execute("EDIT_TASK_DRAFT", { draftId: snapshot.draftId, ...fields })
        : await coreApiClient.execute("PUBLISH_FAMILY_TASK", {
            allowLateSubmission: true,
            ...fields,
            childIds: [childId],
            estimatedMinutes: 15,
            familyId: family.id,
            importance: "REQUIRED",
            occurrenceDate: date,
            requiresAcademicReview: false,
            schedule: { date, kind: "ONCE" },
            sourceAssetIds: snapshot.sourceAssetIds,
          });
      if (snapshot.draftId && result.ok) {
        const published = await coreApiClient.execute("PUBLISH_TASK_DRAFT", {
          allowLateSubmission: true,
          childIds: [childId],
          draftId: snapshot.draftId,
          estimatedMinutes: 15,
          familyId: family.id,
          importance: "REQUIRED",
          occurrenceDate: date,
          requiresAcademicReview: false,
          schedule: { date, kind: "ONCE" },
          sourceAssetIds: snapshot.sourceAssetIds,
        });
        if (!published.ok) throw new Error(published.error.message);
      }
      wx.showToast({
        icon: result.ok ? "success" : "none",
        title: result.ok ? "任务已发布" : result.error.message,
      });
      if (result.ok)
        wx.navigateBack({
          fail: () => wx.redirectTo({ url: "/pages/parent/tasks/index" }),
        });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ publishing: false });
    }
  },
});
