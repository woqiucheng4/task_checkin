import { childTaskFixtures } from "../../../presentation/fixtures.js";
import { buildNavigation, buildTaskRow } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: {
    filter: "ALL",
    navigation: buildNavigation("parent", "tasks"),
    tasks: childTaskFixtures.map((task, index) => ({ ...buildTaskRow(task), focus: index < 2 })),
  },
  chooseFilter(event: {
    readonly currentTarget: { readonly dataset: { readonly filter?: string } };
  }) {
    const filter = event.currentTarget.dataset.filter;
    if (filter !== undefined) this.setData({ filter });
  },
  createTask() {
    navigate("/pages/parent/task-editor/index");
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openTask(event: { readonly detail: { readonly assignmentId?: string } }) {
    const id = event.detail.assignmentId;
    if (id !== undefined) navigate(`/pages/parent/review-detail/index?id=${id}`);
  },
});
