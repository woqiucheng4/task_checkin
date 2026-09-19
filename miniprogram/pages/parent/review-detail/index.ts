import { showError } from "../../../services/session-runtime.js";
import {
  childCommand,
  invalidateChangedChild,
  loadAssignment,
  openSelection,
  requireCurrentChild,
} from "../child-context.js";

async function review(page: MiniPageInstance, decision: string) {
  if (page.data.working || !page.data.ready || !page.data.canReview) return;
  page.setData({ working: true });
  try {
    await childCommand(String(page.data.selectedChildId), "FAMILY_REVIEW", {
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
    await invalidateChangedChild(page);
  } finally {
    page.setData({ working: false });
  }
}
Page({
  data: {
    children: [],
    selectedChildId: "",
    selectedName: "",
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
    ready: false,
    loading: true,
    error: "",
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
  async onLoad(query: { id?: string; childId?: string }) {
    try {
      const task = await loadAssignment(this, query);
      if (!task) return;
      const childId = String(this.data.selectedChildId);
      const images = await Promise.all(
        (task.submission?.mediaAssetIds ?? []).map(async (assetId) => {
          const asset = await childCommand<{ downloadUrl?: string }>(childId, "READ_MEDIA_ASSET", {
            assetId,
          });
          return asset.downloadUrl || "";
        }),
      );
      await requireCurrentChild(childId);
      this.setData({
        ready: true,
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
      this.setData({
        ready: false,
        canReview: false,
        error: error instanceof Error ? error.message : "加载失败",
      });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  async onShow() {
    if (this.data.ready) await invalidateChangedChild(this);
  },
  openSelection() {
    openSelection(this);
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
  async waive() {
    await review(this, "WAIVE");
  },
});
