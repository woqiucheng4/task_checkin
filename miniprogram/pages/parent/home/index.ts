import { ParentController } from "../../../controllers/parent-controller.js";
import { childTaskFixtures } from "../../../presentation/fixtures.js";
import { buildNavigation, buildTaskRow } from "../../../presentation/page-models.js";
import { coreApiClient, navigate, replace } from "../../../services/page-runtime.js";

const children = [
  {
    id: "child-a",
    nickname: "小禾",
    tasks: childTaskFixtures.map((task) => ({ childLabel: "小禾", id: task.assignmentId })),
  },
  {
    id: "child-b",
    nickname: "小满",
    tasks: childTaskFixtures
      .slice(0, 2)
      .map((task) => ({ childLabel: "小满", id: task.assignmentId })),
  },
];
const controller = new ParentController(coreApiClient, children, "child-a");

Page({
  data: {
    children,
    navigation: buildNavigation("parent", "home"),
    pendingReviews: 2,
    selectedChildId: "child-a",
    selectedName: "小禾",
    tasks: childTaskFixtures.map(buildTaskRow),
  },
  createTask() {
    navigate("/pages/parent/task-editor/index");
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openReview() {
    navigate("/pages/parent/reviews/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  openTask(event: { readonly detail: { readonly assignmentId?: string } }) {
    const id = event.detail.assignmentId;
    if (id !== undefined) navigate(`/pages/parent/review-detail/index?id=${id}`);
  },
  selectChild(event: {
    readonly currentTarget: { readonly dataset: { readonly id?: string; readonly name?: string } };
  }) {
    const id = event.currentTarget.dataset.id;
    const name = event.currentTarget.dataset.name;
    if (id === undefined || name === undefined) return;
    controller.selectChild(id);
    this.setData({
      selectedChildId: id,
      selectedName: name,
      tasks:
        id === "child-a"
          ? childTaskFixtures.map(buildTaskRow)
          : childTaskFixtures.slice(0, 2).map(buildTaskRow),
    });
  },
});
