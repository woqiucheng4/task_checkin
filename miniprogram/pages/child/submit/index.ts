import { ChildController } from "../../../controllers/child-controller.js";
import { coreApiClient } from "../../../services/page-runtime.js";

const controller = new ChildController(coreApiClient);

Page({
  data: {
    assignmentId: "school-reading",
    mediaAssetIds: [] as string[],
    mode: "CONFIRM",
    previewImage: "",
    revision: false,
    submitting: false,
    text: "",
  },
  onLoad(query: { readonly id?: string; readonly revision?: string }) {
    this.setData({
      ...(query.id === undefined ? {} : { assignmentId: query.id }),
      revision: query.revision === "1",
    });
  },
  chooseMode(event: { readonly currentTarget: { readonly dataset: { readonly mode?: string } } }) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== undefined) this.setData({ mode });
  },
  editText(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ text: event.detail.value ?? "" });
  },
  async choosePhoto() {
    const selection = await wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
    });
    const filePath = selection.tempFiles[0]?.tempFilePath;
    if (filePath === undefined) return;
    this.setData({ previewImage: filePath });
    const uploaded = await wx.cloud.uploadFile({
      cloudPath: `submissions/${Date.now().toString()}-evidence.jpg`,
      filePath,
    });
    this.setData({ mediaAssetIds: [uploaded.fileID] });
  },
  async submit() {
    this.setData({ submitting: true });
    const mode = String(this.data.mode) as "CONFIRM" | "TEXT" | "PHOTO" | "TEXT_AND_PHOTO";
    const input = {
      assignmentId: String(this.data.assignmentId),
      mediaAssetIds: this.data.mediaAssetIds as readonly string[],
      mode,
      text: String(this.data.text ?? ""),
    };
    if (this.data.revision === true) await controller.supplement(input);
    else await controller.submit(input);
    const state = controller.current();
    this.setData({ submitting: false });
    wx.showToast({ icon: state.status === "success" ? "success" : "none", title: state.notice });
    if (state.status === "success") {
      wx.redirectTo({ url: `/pages/child/task/index?id=${input.assignmentId}&state=submitted` });
    }
  },
});
