import { showError } from "../../../services/session-runtime.js";
import { uploadEvidence } from "../../../services/upload-evidence.js";
import {
  clientForChild,
  invalidateChangedChild,
  loadAssignment,
  openSelection,
  requireCurrentChild,
  taskPath,
} from "../child-context.js";

Page({
  data: {
    assignmentId: "",
    children: [],
    selectedChildId: "",
    selectedName: "",
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
    loading: true,
    ready: false,
    error: "",
    mediaAssetIds: [] as string[],
    previewImages: [] as string[],
    mode: "CONFIRM",
    revision: false,
    submitting: false,
    uploading: false,
    text: "",
  },
  async onLoad(query: { id?: string; childId?: string }) {
    try {
      const item = await loadAssignment(this, query);
      if (!item) return;
      if (item.taskState !== "PENDING" && item.taskState !== "REVISION_REQUIRED")
        throw new Error("该任务已经提交，请返回任务详情查看");
      this.setData({
        ready: true,
        mode: item.submissionMode,
        revision: item.taskState === "REVISION_REQUIRED",
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "加载失败", ready: false });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  async onShow() {
    if (!this.data.ready) return;
    await invalidateChangedChild(this);
  },
  openSelection() {
    openSelection(this);
  },
  editText(event: { detail: { value?: string } }) {
    if (!this.data.submitting) this.setData({ text: event.detail.value ?? "" });
  },
  async choosePhoto() {
    if (!this.data.ready || this.data.uploading || this.data.submitting) return;
    const mediaAssetIds = [...(this.data.mediaAssetIds as string[])];
    const previewImages = [...(this.data.previewImages as string[])];
    if (mediaAssetIds.length >= 3) {
      wx.showToast({ icon: "none", title: "最多上传 3 张图片" });
      return;
    }
    const childId = String(this.data.selectedChildId);
    const assignmentId = String(this.data.assignmentId);
    const client = clientForChild(childId);
    this.setData({ uploading: true });
    try {
      await requireCurrentChild(childId);
      const selection = await wx.chooseMedia({
        count: 3 - mediaAssetIds.length,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });
      for (const file of selection.tempFiles.slice(0, 3 - mediaAssetIds.length)) {
        const base64 = wx.getFileSystemManager().readFileSync(file.tempFilePath, "base64");
        const mediaId = await uploadEvidence(client, assignmentId, base64);
        await requireCurrentChild(childId);
        mediaAssetIds.push(mediaId);
        previewImages.push(file.tempFilePath);
        this.setData({ mediaAssetIds: [...mediaAssetIds], previewImages: [...previewImages] });
      }
    } catch (error) {
      showError(error);
      await invalidateChangedChild(this);
    } finally {
      this.setData({ uploading: false });
    }
  },
  removePhoto(event: { currentTarget: { dataset: { index?: number } } }) {
    if (this.data.uploading || this.data.submitting) return;
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0) return;
    this.setData({
      mediaAssetIds: (this.data.mediaAssetIds as string[]).filter((_, i) => i !== index),
      previewImages: (this.data.previewImages as string[]).filter((_, i) => i !== index),
    });
  },
  async submit() {
    if (!this.data.ready || this.data.submitting || this.data.uploading) return;
    const childId = String(this.data.selectedChildId);
    const assignmentId = String(this.data.assignmentId);
    const mediaAssetIds = [...(this.data.mediaAssetIds as string[])];
    if (mediaAssetIds.length > 3) {
      wx.showToast({ icon: "none", title: "最多上传 3 张图片" });
      return;
    }
    const input = {
      assignmentId,
      mediaAssetIds,
      mode: String(this.data.mode),
      text: String(this.data.text || ""),
    };
    this.setData({ submitting: true });
    try {
      const result = await clientForChild(childId).execute(
        this.data.revision ? "SUPPLEMENT_SUBMISSION" : "SUBMIT_TASK",
        input,
      );
      if (!result.ok) throw new Error(result.error.message);
      this.setData({ ready: false });
      wx.showToast({ icon: "success", title: "已为孩子提交完成情况" });
      await requireCurrentChild(childId);
      wx.redirectTo({ url: taskPath(this, assignmentId) });
    } catch (error) {
      showError(error);
      await invalidateChangedChild(this);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
