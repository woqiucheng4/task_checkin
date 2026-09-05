import { navigate } from "../../../services/page-runtime.js";

Page({
  data: {
    filter: "PENDING",
    items: [
      { id: "assignment-1", name: "晨曦 07", status: "订正后再次提交", time: "10:24" },
      { id: "assignment-2", name: "晨曦 12", status: "待学习审核", time: "10:08" },
      { id: "assignment-3", name: "晨曦 18", status: "待学习审核", time: "09:52" },
    ],
  },
  chooseFilter(event: {
    readonly currentTarget: { readonly dataset: { readonly filter?: string } };
  }) {
    const filter = event.currentTarget.dataset.filter;
    if (filter !== undefined) this.setData({ filter });
  },
  open(event: { readonly currentTarget: { readonly dataset: { readonly id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined) navigate(`/pages/teacher/review-detail/index?id=${id}`);
  },
});
