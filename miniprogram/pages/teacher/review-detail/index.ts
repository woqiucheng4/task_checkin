import { TeacherController } from "../../../controllers/teacher-controller.js";
import { coreApiClient } from "../../../services/page-runtime.js";

const controller = new TeacherController(coreApiClient);
function finish(): void {
  const notice = controller.current().notice;
  wx.showToast({
    icon: notice.includes("已") || notice.includes("通过") ? "success" : "none",
    title: notice,
  });
  if (notice.includes("已") || notice.includes("通过")) wx.navigateBack();
}

Page({
  data: { assignmentId: "assignment-1", note: "" },
  onLoad(query: { readonly id?: string }) {
    if (query.id !== undefined) this.setData({ assignmentId: query.id });
  },
  editNote(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ note: event.detail.value ?? "" });
  },
  async approve() {
    await controller.approve(String(this.data.assignmentId), String(this.data.note));
    finish();
  },
  async revise() {
    if (!String(this.data.note).trim()) {
      wx.showToast({ icon: "none", title: "请填写具体订正建议" });
      return;
    }
    await controller.requestRevision(String(this.data.assignmentId), String(this.data.note));
    finish();
  },
});
