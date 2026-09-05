import { ChildController } from "../../../controllers/child-controller.js";
import { buildNavigation } from "../../../presentation/page-models.js";
import { coreApiClient, navigate, replace } from "../../../services/page-runtime.js";

const controller = new ChildController(coreApiClient);

Page({
  data: {
    collection: [
      { asset: "/assets/orchard/apple-mature.png", count: 2, name: "苹果" },
      { asset: "/assets/orchard/pear-mature.png", count: 1, name: "梨" },
      { asset: "/assets/orchard/orange-mature.png", count: 0, name: "橙子" },
    ],
    current: 30,
    navigation: buildNavigation("child", "orchard"),
    progress: 100,
    selecting: false,
    stages: [
      { asset: "/assets/orchard/apple-seed.png", done: true, label: "种子" },
      { asset: "/assets/orchard/apple-sprout.png", done: true, label: "发芽" },
      { asset: "/assets/orchard/apple-seedling.png", done: true, label: "幼苗" },
      { asset: "/assets/orchard/apple-trunk.png", done: true, label: "树干" },
      { asset: "/assets/orchard/apple-leaves.png", done: true, label: "长叶" },
      { asset: "/assets/orchard/apple-bud.png", done: true, label: "花苞" },
      { asset: "/assets/orchard/apple-blossom.png", done: true, label: "开花" },
      { asset: "/assets/orchard/apple-fruit-small.png", done: true, label: "幼果" },
      { asset: "/assets/orchard/apple-fruit-growing.png", done: true, label: "长大" },
      { asset: "/assets/orchard/apple-mature.png", done: true, label: "成熟" },
    ],
    target: 30,
  },
  async harvest() {
    await controller.harvest("tree-apple-1");
    const result = controller.current();
    wx.showToast({ icon: result.status === "success" ? "success" : "none", title: result.notice });
    if (result.status === "success") this.setData({ selecting: true });
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openGroup() {
    navigate("/pages/child/group/index");
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  async startNext(event: {
    readonly currentTarget: {
      readonly dataset: { readonly fruit?: string; readonly name?: string };
    };
  }) {
    const fruitTypeId = event.currentTarget.dataset.fruit;
    const name = event.currentTarget.dataset.name;
    if (fruitTypeId === undefined || name === undefined) return;
    await controller.startTree(fruitTypeId, name);
    const result = controller.current();
    wx.showToast({ icon: result.status === "success" ? "success" : "none", title: result.notice });
    if (result.status === "success") this.setData({ current: 0, progress: 0, selecting: false });
  },
});
