import { ChildController } from "../../../controllers/child-controller.js";
import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import {
  childClient,
  command,
  selectedChild,
  dashboard,
  showError,
} from "../../../services/session-runtime.js";
import type { OrchardView } from "../../../../src/application/orchard-service.js";

const controller = new ChildController(childClient);

async function load(page: MiniPageInstance) {
  page.setData({ loading: true, ready: false, selecting: false });
  try {
    const childId = await selectedChild();
    const view = await command<OrchardView>("GET_CHILD_ORCHARD", {}, { mode: "CHILD", childId });
    const home = await dashboard();
    const current = view.currentTree;
    const target = home.currentTree?.threshold || 6;
    page.setData({
      ready: true,
      treeId: current?.id || "",
      current: current?.progress || 0,
      target,
      progress: current ? Math.min(100, (current.progress / target) * 100) : 0,
      selecting: !current,
      mature: current?.status === "MATURE",
      nickname: home.selectedChild.nickname,
      treeName: home.currentTree?.name || "选择第一棵果树",
      stage: current?.stage || "等待种植",
      asset:
        current?.status === "MATURE"
          ? "/assets/orchard/apple-mature.webp"
          : "/assets/orchard/apple-seedling.webp",
      collection: [
        { id: "starter-apple", name: "苹果", asset: "/assets/orchard/apple-mature.webp" },
        { id: "ordinary-pear", name: "梨", asset: "/assets/orchard/pear-mature.webp" },
        { id: "rare-orange", name: "橙子", asset: "/assets/orchard/orange-mature.webp" },
      ].map((c) => ({ ...c, count: view.fruits.find((f) => f.catalogId === c.id)?.quantity || 0 })),
      stages: (page.data.stages as { asset: string; label: string }[]).map((s, index) => ({
        ...s,
        done: !!current && current.progress / target >= index / 9,
      })),
    });
  } catch (error) {
    showError(error);
  } finally {
    page.setData({ loading: false });
  }
}

Page({
  async onShow() {
    await load(this);
  },
  data: {
    collection: [
      { asset: "/assets/orchard/apple-mature.webp", count: 0, name: "苹果" },
      { asset: "/assets/orchard/pear-mature.webp", count: 0, name: "梨" },
      { asset: "/assets/orchard/orange-mature.webp", count: 0, name: "橙子" },
    ],
    loading: true,
    ready: false,
    working: false,
    current: 0,
    navigation: buildNavigation("child", "orchard"),
    progress: 0,
    selecting: false,
    stages: [
      { asset: "/assets/orchard/apple-seed.webp", done: false, label: "种子" },
      { asset: "/assets/orchard/apple-sprout.webp", done: false, label: "发芽" },
      { asset: "/assets/orchard/apple-seedling.webp", done: false, label: "幼苗" },
      { asset: "/assets/orchard/apple-trunk.webp", done: false, label: "树干" },
      { asset: "/assets/orchard/apple-leaves.webp", done: false, label: "长叶" },
      { asset: "/assets/orchard/apple-bud.webp", done: false, label: "花苞" },
      { asset: "/assets/orchard/apple-blossom.webp", done: false, label: "开花" },
      { asset: "/assets/orchard/apple-fruit-small.webp", done: false, label: "幼果" },
      { asset: "/assets/orchard/apple-fruit-growing.webp", done: false, label: "长大" },
      { asset: "/assets/orchard/apple-mature.webp", done: false, label: "成熟" },
    ],
    target: 0,
  },
  async harvest() {
    if (!this.data.ready || this.data.working || !this.data.treeId || !this.data.mature) return;
    await controller.harvest(String(this.data.treeId));
    const result = controller.current();
    wx.showToast({ icon: result.status === "success" ? "success" : "none", title: result.notice });
    if (result.status === "success") await load(this);
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  async startNext(event: {
    readonly currentTarget: {
      readonly dataset: { readonly fruit?: string; readonly name?: string };
    };
  }) {
    if (!this.data.ready || this.data.working || !this.data.selecting) return;
    const fruitTypeId = event.currentTarget.dataset.fruit;
    const name = event.currentTarget.dataset.name;
    if (fruitTypeId === undefined || name === undefined) return;
    await controller.startTree(fruitTypeId, name);
    const result = controller.current();
    wx.showToast({ icon: result.status === "success" ? "success" : "none", title: result.notice });
    if (result.status === "success") await load(this);
  },
});
