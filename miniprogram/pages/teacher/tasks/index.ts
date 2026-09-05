import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: {
    filter: "ACTIVE",
    navigation: buildNavigation("teacher", "tasks"),
    tasks: [
      {
        completed: 23,
        due: "今天 20:00",
        id: "task-1",
        status: "进行中",
        title: "语文 · 朗读《秋天的雨》",
        total: 32,
      },
      {
        completed: 28,
        due: "今天 21:00",
        id: "task-2",
        status: "进行中",
        title: "数学 · 完成练习题 5 道",
        total: 32,
      },
    ],
  },
  create() {
    navigate("/pages/teacher/task-editor/index");
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openReviews(event: { readonly currentTarget: { readonly dataset: { readonly id?: string } } }) {
    const id = event.currentTarget.dataset.id;
    if (id !== undefined) navigate(`/pages/teacher/reviews/index?task=${id}`);
  },
});
