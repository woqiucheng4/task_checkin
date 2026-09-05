import { navigate } from "../../../services/page-runtime.js";

Page({
  data: {
    children: [
      { id: "child-a", name: "小禾", count: 2 },
      { id: "child-b", name: "小满", count: 1 },
    ],
    items: [
      {
        academic: "老师已通过",
        id: "school-math",
        source: "学校",
        submittedAt: "09:48",
        title: "数学 · 完成练习题 5 道",
      },
      {
        academic: "无需学习评价",
        id: "family-desk",
        source: "家庭",
        submittedAt: "10:12",
        title: "整理自己的书桌",
      },
    ],
    selected: "child-a",
  },
  open(event: { readonly currentTarget: { readonly dataset: { readonly id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined) navigate(`/pages/parent/review-detail/index?id=${id}`);
  },
  selectChild(event: { readonly currentTarget: { readonly dataset: { readonly id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined) this.setData({ selected: id });
  },
});
