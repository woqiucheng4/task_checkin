import { buildChildTodayPage, resolveChildTreeAsset } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";
import { dashboard, today } from "../../../services/session-runtime.js";

const empty = () =>
  buildChildTodayPage({
    date: today(),
    nickname: "",
    screenState: "loading",
    sunlight: { current: 0, target: 30 },
    tasks: [],
    tree: { asset: "/assets/orchard/apple-seed.webp", level: 1, name: "我的果树" },
  });
async function load(page: MiniPageInstance) {
  page.setData({ screenState: "loading" });
  try {
    const view = await dashboard();
    const tree = view.currentTree;
    page.setData(
      buildChildTodayPage({
        date: today(),
        nickname: view.selectedChild.nickname,
        screenState: view.today.items.length ? "ready" : "empty",
        tasks: view.today.items,
        sunlight: { current: tree?.progress || 0, target: tree?.threshold || 30 },
        tree: {
          name: tree?.name || "去果园种下第一棵树",
          level: 1,
          asset: tree
            ? resolveChildTreeAsset({
                progress: tree.progress,
                status: tree.status,
                threshold: tree.threshold,
              })
            : "/assets/orchard/apple-seedling.webp",
          embeddedSign: tree
            ? resolveChildTreeAsset({
                progress: tree.progress,
                status: tree.status,
                threshold: tree.threshold,
              }) === "/assets/orchard/apple-reference-lv1-cutout.png"
            : false,
        },
      }),
    );
  } catch (error) {
    page.setData({
      screenState: "error",
      notice: error instanceof Error ? error.message : "加载失败",
    });
  }
}
Page({
  data: empty(),
  onShow() {
    void load(this);
  },
  activateTask(event: { detail: { assignmentId?: string } }) {
    if (event.detail.assignmentId)
      navigate(`/pages/child/task/index?id=${event.detail.assignmentId}`);
  },
  navigateTab(event: { detail: { path?: string } }) {
    if (event.detail.path) replace(event.detail.path);
  },
  openRoles() {
    navigate("/pages/shared/role-switcher/index");
  },
  retry() {
    void load(this);
  },
});
