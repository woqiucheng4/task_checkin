import type { OrchardView } from "../../../../src/application/orchard-service.js";
import { buildNavigation } from "../../../presentation/page-models.js";
import { dashboard, showError } from "../../../services/session-runtime.js";
import {
  childCommand,
  childSelection,
  guardedNavigate,
  openSelection,
  requireCurrentChild,
} from "../child-context.js";

const APPLE_STAGE_ASSETS: Readonly<Record<string, string>> = {
  种子: "/assets/orchard/apple-seed.webp",
  破土: "/assets/orchard/apple-sprout.webp",
  嫩芽: "/assets/orchard/apple-seedling.webp",
  树干: "/assets/orchard/apple-trunk.webp",
  长叶: "/assets/orchard/apple-leaves.webp",
  花苞: "/assets/orchard/apple-bud.webp",
  开花: "/assets/orchard/apple-blossom.webp",
  小果: "/assets/orchard/apple-fruit-small.webp",
  果实变大: "/assets/orchard/apple-fruit-growing.webp",
  成熟采摘: "/assets/orchard/apple-mature.webp",
};

function treeAsset(status: string | undefined, stage: string | undefined): string {
  if (status === "MATURE") return "/assets/orchard/apple-mature.webp";
  return APPLE_STAGE_ASSETS[stage || ""] || "/assets/orchard/apple-seed.webp";
}

async function load(page: MiniPageInstance) {
  page.setData({
    loading: true,
    ready: false,
    selectionRequired: true,
    selectedChildId: "",
    error: "",
    current: 0,
    growthCards: [],
    fruits: [],
    treeId: "",
    mature: false,
  });
  try {
    const home = await dashboard();
    page.setData(childSelection(home));
    if (home.selectionRequired) return;
    const orchard = await childCommand<OrchardView>(home.selectedChild.id, "GET_CHILD_ORCHARD");
    await requireCurrentChild(home.selectedChild.id);
    const current = orchard.currentTree?.progress || 0;
    const target =
      orchard.currentTree?.status === "MATURE"
        ? Math.max(1, current)
        : home.currentTree?.threshold || 30;
    page.setData({
      ready: true,
      child: home.selectedChild.nickname,
      current,
      target,
      treeId: orchard.currentTree?.id || "",
      mature: orchard.currentTree?.status === "MATURE",
      remaining: Math.max(0, target - current),
      progressPercent: Math.min(100, (current / target) * 100),
      treeName:
        orchard.currentTree?.name ||
        home.currentTree?.name ||
        (orchard.currentTree ? "孩子的果树" : "为孩子种下第一棵树"),
      treeTitle: home.selectedChild.nickname ? `${home.selectedChild.nickname}的小树` : "我的小树",
      lifetimeSunlight: orchard.lifetimeSunlight,
      growthCards: orchard.growthCards.map((card) => ({
        ...card,
        date: card.harvestedAt.slice(0, 10),
      })),
      fruits: orchard.fruits,
      asset: treeAsset(
        orchard.currentTree?.status,
        orchard.currentTree?.stage || home.currentTree?.stage,
      ),
    });
  } catch (error) {
    page.setData({ error: error instanceof Error ? error.message : "加载失败" });
    showError(error);
  } finally {
    page.setData({ loading: false });
  }
}

Page({
  data: {
    child: "",
    selectedChildId: "",
    selectedName: "",
    children: [],
    selectionRequired: true,
    selectionMessage: "请选择要操作的孩子",
    selectionAction: "选择孩子",
    navigation: buildNavigation("parent", "orchard"),
    current: 0,
    target: 30,
    remaining: 30,
    progressPercent: 0,
    treeName: "尚未种树",
    treeTitle: "我的小树",
    treeId: "",
    mature: false,
    ready: false,
    working: false,
    lifetimeSunlight: 0,
    growthCards: [],
    fruits: [],
    catalogs: [
      { id: "starter-apple", name: "苹果树" },
      { id: "ordinary-pear", name: "梨树" },
      { id: "rare-orange", name: "橙子树" },
    ],
    asset: "/assets/orchard/apple-seed.webp",
    loading: true,
    error: "",
  },
  async onShow() {
    await load(this);
  },
  openSelection() {
    openSelection(this);
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) guardedNavigate(this, event.detail.path, true);
  },
  async harvest() {
    if (!this.data.ready || this.data.working || !this.data.treeId || !this.data.mature) return;
    this.setData({ working: true });
    try {
      await childCommand(String(this.data.selectedChildId), "HARVEST_TREE", {
        treeId: this.data.treeId,
      });
      wx.showToast({ icon: "success", title: "已为孩子采摘果实" });
      await load(this);
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
  async startNext(event: { currentTarget: { dataset: { catalogId?: string } } }) {
    const catalogId = event.currentTarget.dataset.catalogId;
    if (
      !this.data.ready ||
      this.data.working ||
      this.data.treeId ||
      !catalogId ||
      !(this.data.catalogs as { id: string }[]).some((item) => item.id === catalogId)
    )
      return;
    this.setData({ working: true });
    try {
      await childCommand(String(this.data.selectedChildId), "START_TREE", { catalogId });
      await load(this);
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
