import { ChildController } from "../../../controllers/child-controller.js";
import { childClient, taskDetail, showError } from "../../../services/session-runtime.js";
import { uploadEvidence } from "../../../services/upload-evidence.js";

const controller = new ChildController(childClient);

Page({
  data: {
    assignmentId: "",
    mediaAssetIds: [] as string[],
    mode: "CONFIRM",
    previewImage: "",
    revision: false,
    submitting: false,
    uploading: false,
    text: "",
  },
  async onLoad(query: { readonly id?: string; readonly revision?: string }) {
    this.setData({
      ...(query.id === undefined ? {} : { assignmentId: query.id }),
      revision: query.revision === "1",
    });
    if (query.id) {
      try {
        const task = await taskDetail(query.id);
        this.setData({ mode: task.submissionMode });
      } catch (error) {
        showError(error);
      }
    }
  },
  chooseMode(event: { readonly currentTarget: { readonly dataset: { readonly mode?: string } } }) {
    const mode = event.currentTarget.dataset.mode;
    if (mode !== undefined) this.setData({ mode });
  },
  editText(event: { readonly detail: { readonly value?: string } }) {
    this.setData({ text: event.detail.value ?? "" });
  },
  async choosePhoto() {
    if (this.data.uploading || this.data.submitting) return;
    this.setData({ uploading: true });
    try {
      const selection = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
      });
      const filePath = selection.tempFiles[0]?.tempFilePath;
      if (filePath === undefined) return;
      const base64 = wx.getFileSystemManager().readFileSync(filePath, "base64");
      const mediaId = await uploadEvidence(childClient, String(this.data.assignmentId), base64);
      this.setData({ previewImage: filePath, mediaAssetIds: [mediaId] });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ uploading: false });
    }
  },
  async submit() {
    if (this.data.submitting || this.data.uploading) return;
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
