import { showError } from "../../../services/session-runtime.js";
import {
  childCommand,
  guardedNavigate,
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
    source: "",
    state: "pending",
    task: {},
    images: [],
  },
  async onLoad(query: { id?: string; childId?: string }) {
    this.setData({ loading: true, ready: false, images: [], error: "" });
    try {
      const item = await loadAssignment(this, query);
      if (!item) return;
      const childId = String(this.data.selectedChildId);
      const images = await Promise.all(
        item.sourceAssetIds.map(async (assetId) => {
          const asset = await childCommand<{ downloadUrl?: string }>(childId, "READ_MEDIA_ASSET", {
            assetId,
          });
          return asset.downloadUrl || "";
        }),
      );
      await requireCurrentChild(childId);
      this.setData({
        ready: true,
        source: item.source === "FAMILY" ? "家庭" : "共育分组",
        state:
          item.taskState === "PENDING"
            ? "pending"
            : item.taskState === "REVISION_REQUIRED"
              ? "revision"
              : "submitted",
        task: {
          title: item.title,
          description: item.description || "",
          category: item.category,
          due: item.dueAt,
          mode: item.submissionMode,
          reward: "完成并经家长确认后，按家庭规则获得阳光",
        },
        images: images.filter(Boolean),
      });
    } catch (error) {
      this.setData({
        error: error instanceof Error ? error.message : "加载失败",
        ready: false,
        images: [],
        task: {},
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
        ready: false,
        images: [],
        task: {},
        error: "孩子已切换，请返回首页重新选择任务",
      });
    }
  },
  openSelection() {
    openSelection(this);
  },
  async openSubmit() {
    if (!this.data.ready) return;
    try {
      await requireCurrentChild(String(this.data.selectedChildId));
      guardedNavigate(this, taskPath(this, String(this.data.assignmentId), true));
    } catch (error) {
      showError(error);
      this.setData({
        ready: false,
        error: "孩子已切换，请返回首页重新选择任务",
        images: [],
        task: {},
      });
    }
  },
});
