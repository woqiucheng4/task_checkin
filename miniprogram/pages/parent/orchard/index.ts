import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { dashboard, command, selectedChild, showError } from "../../../services/session-runtime.js";
import type { OrchardView } from "../../../../src/application/orchard-service.js";

Page({
  data: {
    child: "",
    navigation: buildNavigation("parent", "orchard"),
    current: 0,
    target: 6,
    remaining: 6,
    progressPercent: 0,
    treeName: "尚未种树",
    lifetimeSunlight: 0,
    growthCards: [],
    asset: "/assets/orchard/apple-seed.webp",
    loading: true,
    error: "",
  },
  async onShow() {
    this.setData({ loading: true, error: "" });
    try {
      const home = await dashboard();
      const orchard = await command<OrchardView>(
        "GET_CHILD_ORCHARD",
        {},
        { mode: "CHILD", childId: await selectedChild() },
      );
      const current = home.currentTree?.progress || 0;
      const target = home.currentTree?.threshold || 6;
      this.setData({
        child: home.selectedChild.nickname,
        current,
        target,
        remaining: Math.max(0, target - current),
        progressPercent: Math.min(100, (current / target) * 100),
        treeName: home.currentTree?.name || "孩子还没有种树",
        lifetimeSunlight: orchard.lifetimeSunlight,
        growthCards: orchard.growthCards.map((card) => ({
          ...card,
          date: card.harvestedAt.slice(0, 10),
        })),
        asset:
          home.currentTree?.status === "MATURE"
            ? "/assets/orchard/apple-mature.webp"
            : "/assets/orchard/apple-seedling.webp",
      });
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "加载失败" });
      showError(error);
    } finally {
      this.setData({ loading: false });
    }
  },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openWishes() {
    navigate("/pages/parent/wishes/index");
  },
});
