import { accountShell, showError } from "../../../services/session-runtime.js";
Page({
  data: { roles: [] },
  async onShow() {
    try {
      const shell = await accountShell(true);
      this.setData({
        roles: [
          ...(shell.families.some((f) => f.children.length)
            ? [
                { label: "孩子", path: "/pages/child/today/index" },
                { label: "家长", path: "/pages/parent/home/index" },
              ]
            : [{ label: "创建我的家庭", path: "/pages/bootstrap/index" }]),
          { label: "教师／助教", path: "/pages/teacher/home/index" },
        ],
      });
    } catch (error) {
      showError(error);
    }
  },
  choose(event: { currentTarget: { dataset: { path?: string } } }) {
    if (event.currentTarget.dataset.path) wx.redirectTo({ url: event.currentTarget.dataset.path });
  },
});
