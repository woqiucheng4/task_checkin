import {
  command,
  selectedChild,
  selectedFamily,
  showError,
} from "../../../services/session-runtime.js";
import type { FamilyWishView } from "../../../../src/application/wish-service.js";

async function load(page: MiniPageInstance) {
  const childId = await selectedChild();
  const family = await selectedFamily();
  const view = await command<FamilyWishView>("GET_FAMILY_WISHES", { childId });
  const fruits = view.fruits.map((f) => ({
    ...f,
    name:
      (
        { "starter-apple": "苹果", "ordinary-pear": "梨", "rare-orange": "橙子" } as Record<
          string,
          string
        >
      )[f.catalogId] || "果实",
    available: f.quantity - f.reservedQuantity,
  }));
  page.setData({
    nickname: family.children.find((c) => c.id === childId)?.nickname || "",
    wishes: view.wishes
      .filter((w) => w.status !== "ARCHIVED")
      .map((w) => ({
        ...w,
        fruits: fruits.map((f) => ({
          ...f,
          reserved: view.links
            .filter((l) => l.wishId === w.id && l.fruitCollectionId === f.id)
            .reduce((sum, l) => sum + (l.action === "RESERVED" ? l.quantity : -l.quantity), 0),
        })),
        progress: view.links
          .filter((l) => l.wishId === w.id)
          .reduce((sum, l) => sum + (l.action === "RESERVED" ? l.quantity : -l.quantity), 0),
      })),
  });
}
async function mutate(
  page: MiniPageInstance,
  action: "LINK_FRUIT" | "UNLINK_FRUIT" | "FULFILL_WISH",
  payload: Record<string, unknown>,
) {
  if (page.data.working) return;
  page.setData({ working: true });
  try {
    await command(action, payload);
    await load(page);
    wx.showToast({ icon: "success", title: "已保存" });
  } catch (error) {
    showError(error);
  } finally {
    page.setData({ working: false });
  }
}
Page({
  data: { creating: false, working: false, title: "", nickname: "", wishes: [] },
  async onShow() {
    try {
      await load(this);
    } catch (error) {
      showError(error);
    }
  },
  beginCreate() {
    this.setData({ creating: true });
  },
  editTitle(event: { detail: { value?: string } }) {
    this.setData({ title: event.detail.value || "" });
  },
  async createWish() {
    if (this.data.working) return;
    const title = String(this.data.title || "").trim();
    if (!title) {
      wx.showToast({ icon: "none", title: "请填写愿望" });
      return;
    }
    this.setData({ working: true });
    try {
      await command("CREATE_WISH", { childId: await selectedChild(), title });
      this.setData({ creating: false, title: "" });
      await load(this);
      wx.showToast({ icon: "success", title: "愿望已保存" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
  async fulfill(event: { currentTarget: { dataset: { id?: string } } }) {
    if (event.currentTarget.dataset.id)
      await mutate(this, "FULFILL_WISH", { wishId: event.currentTarget.dataset.id });
  },
  async linkFruit(event: {
    currentTarget: { dataset: { wish?: string; fruit?: string; release?: boolean } };
  }) {
    const { wish, fruit, release } = event.currentTarget.dataset;
    if (wish && fruit)
      await mutate(this, release ? "UNLINK_FRUIT" : "LINK_FRUIT", {
        wishId: wish,
        fruitCollectionId: fruit,
        quantity: 1,
      });
  },
});
