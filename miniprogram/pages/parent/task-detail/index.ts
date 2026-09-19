import type { AcademicReviewState, TaskInstanceState } from "../../../../src/domain/model.js";
import { showError } from "../../../services/session-runtime.js";
import {
  childCommand,
  guardedNavigate,
  loadAssignment,
  openSelection,
  requireCurrentChild,
  taskPath,
} from "../child-context.js";

const TASK_STATUS: Record<TaskInstanceState, { title: string; description: string }> = {
  PENDING: { title: "待完成", description: "请按任务要求完成后提交。" },
  SUBMITTED: { title: "完成情况已提交", description: "可查看下方提交记录和评价状态。" },
  REVISION_REQUIRED: { title: "需要订正", description: "请和孩子一起订正后再次提交。" },
  COMPLETED: { title: "任务已完成", description: "可查看本次提交记录和评价结果。" },
  EXPIRED: { title: "任务已过期", description: "已超过任务有效期，当前不可提交。" },
  CANCELLED: { title: "任务已取消", description: "本次任务已取消，无需继续完成。" },
  EXCUSED: { title: "任务已免做", description: "本次任务已免除，无需提交完成情况。" },
};
const ACADEMIC_LABELS: Record<AcademicReviewState, string> = {
  NOT_REQUIRED: "无需老师审核",
  PENDING: "等待老师审核",
  APPROVED: "老师已通过",
  REVISION_REQUIRED: "老师要求订正",
  EXCUSED: "老师已免除",
};
const EMPTY_DETAIL = {
  state: "",
  statusTitle: "",
  statusDescription: "",
  canSubmit: false,
  task: {},
  images: [],
  hasSubmission: false,
  submissionText: "",
  submissionImages: [],
  submittedAt: "",
  submissionRevision: 0,
  academicState: "",
  academicLabel: "",
  showAcademic: false,
};

async function readImages(childId: string, assetIds: readonly string[]): Promise<string[]> {
  const images = await Promise.all(
    assetIds.map(async (assetId) => {
      const asset = await childCommand<{ downloadUrl?: string }>(childId, "READ_MEDIA_ASSET", {
        assetId,
      });
      return asset.downloadUrl || "";
    }),
  );
  return images.filter(Boolean);
}

Page({
  data: {
    ...EMPTY_DETAIL,
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
    source: "",
  },
  async onLoad(query: { id?: string; childId?: string }) {
    this.setData({ ...EMPTY_DETAIL, loading: true, ready: false, error: "" });
    try {
      const item = await loadAssignment(this, query);
      if (!item) return;
      const childId = String(this.data.selectedChildId);
      const [images, submissionImages] = await Promise.all([
        readImages(childId, item.sourceAssetIds),
        readImages(childId, item.submission?.mediaAssetIds ?? []),
      ]);
      await requireCurrentChild(childId);
      this.setData({
        ready: true,
        source: item.source === "FAMILY" ? "家庭" : "共育分组",
        state: item.taskState,
        statusTitle: TASK_STATUS[item.taskState].title,
        statusDescription: TASK_STATUS[item.taskState].description,
        canSubmit: item.taskState === "PENDING" || item.taskState === "REVISION_REQUIRED",
        academicState: item.academicState,
        academicLabel: ACADEMIC_LABELS[item.academicState],
        showAcademic: item.source !== "FAMILY",
        hasSubmission: !!item.submission,
        submissionText: item.submission?.text || "",
        submittedAt: item.submission?.submittedAt || "",
        submissionRevision: item.submission?.revision || 0,
        submissionImages,
        task: {
          title: item.title,
          description: item.description || "",
          category: item.category,
          due: item.dueAt,
          mode: item.submissionMode,
          reward: "完成并经家长确认后，按家庭规则获得阳光",
        },
        images,
      });
    } catch (error) {
      this.setData({
        ...EMPTY_DETAIL,
        error: error instanceof Error ? error.message : "加载失败",
        ready: false,
      });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  async onShow() {
    if (!this.data.ready) return;
    try {
      await requireCurrentChild(String(this.data.selectedChildId));
    } catch {
      this.setData({
        ...EMPTY_DETAIL,
        ready: false,
        error: "孩子已切换，请返回首页重新选择任务",
      });
    }
  },
  openSelection() {
    openSelection(this);
  },
  async openSubmit() {
    if (!this.data.ready || !this.data.canSubmit) return;
    try {
      await requireCurrentChild(String(this.data.selectedChildId));
      guardedNavigate(this, taskPath(this, String(this.data.assignmentId), true));
    } catch (error) {
      showError(error);
      this.setData({
        ...EMPTY_DETAIL,
        ready: false,
        error: "孩子已切换，请返回首页重新选择任务",
      });
    }
  },
});
