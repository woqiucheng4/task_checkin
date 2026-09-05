import { navigate } from "../../../services/page-runtime.js";

Page({
  data: {
    assignmentId: "school-reading",
    feedback: "",
    source: "学校 · 三年级 2 班",
    state: "pending",
    task: {
      category: "语文",
      description: "认真朗读《秋天的雨》，注意停顿和语气，完成后确认提交。",
      due: "今天 20:00",
      mode: "确认提交",
      reward: "完成并经家长确认，可获得 6 阳光",
      title: "朗读《秋天的雨》",
    },
  },
  onLoad(query: { readonly id?: string; readonly state?: string }) {
    this.setData({
      ...(query.id === undefined ? {} : { assignmentId: query.id }),
      ...(query.state === undefined ? {} : { state: query.state }),
    });
  },
  openSubmit() {
    const assignmentId = String(this.data.assignmentId ?? "");
    navigate(`/pages/child/submit/index?id=${assignmentId}`);
  },
  revise() {
    const assignmentId = String(this.data.assignmentId ?? "");
    navigate(`/pages/child/submit/index?id=${assignmentId}&revision=1`);
  },
});
