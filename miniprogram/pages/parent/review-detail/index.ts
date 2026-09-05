import { ParentController } from "../../../controllers/parent-controller.js";
import { coreApiClient } from "../../../services/page-runtime.js";

const controller = new ParentController(coreApiClient, [], "child-a");

function showResult(): void {
  const state = controller.current();
  wx.showToast({ icon: state.notice.startsWith("已") ? "success" : "none", title: state.notice });
  if (state.notice.startsWith("已")) wx.navigateBack();
}

Page({
  data: { assignmentId: "school-math", note: "", source: "SCHOOL" },
  onLoad(query: { readonly id?: string }) {
    if (query.id !== undefined)
      this.setData({
        assignmentId: query.id,
        source: query.id.startsWith("family") ? "FAMILY" : "SCHOOL",
      });
  },
  editNote(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ note: event.detail.value ?? "" });
  },
  async approve() {
    await controller.confirmSunlight(String(this.data.assignmentId), 6);
    showResult();
  },
  async revise() {
    await controller.requestRevision(String(this.data.assignmentId), String(this.data.note));
    showResult();
  },
  async waive() {
    await controller.waiveSunlight(String(this.data.assignmentId), String(this.data.note));
    showResult();
  },
});
