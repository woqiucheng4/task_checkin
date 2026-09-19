import { accountShell, showError } from "../../../services/session-runtime.js";

const PARENT_HOME = "/pages/parent/home/index";
const TEACHER_HOME = "/pages/teacher/home/index";
const TEACHER_ACTIVATION = "/pages/teacher/activation/index";
const BOOTSTRAP = "/pages/bootstrap/index";

function hasParentWorkspace(shell: Awaited<ReturnType<typeof accountShell>>): boolean {
  return shell.families.some((family) => family.children.length > 0);
}

function hasTeacherWorkspace(shell: Awaited<ReturnType<typeof accountShell>>): boolean {
  return shell.organizations.some((organization) => organization.type === "TEACHER_WORKSPACE");
}

Page({
  data: { roles: [] },
  async onShow() {
    try {
      const shell = await accountShell(true);
      this.setData({
        roles: [
          ...(hasParentWorkspace(shell)
            ? [{ label: "家长", path: PARENT_HOME }]
            : [{ label: "创建我的家庭", path: BOOTSTRAP }]),
          {
            label: "教师／助教",
            path: hasTeacherWorkspace(shell) ? TEACHER_HOME : TEACHER_ACTIVATION,
          },
        ],
      });
    } catch (error) {
      showError(error);
    }
  },
  choose(event: { currentTarget: { dataset: { path?: string } } }) {
    const path = event.currentTarget.dataset.path;
    if (
      path === PARENT_HOME ||
      path === TEACHER_HOME ||
      path === TEACHER_ACTIVATION ||
      path === BOOTSTRAP
    ) {
      wx.redirectTo({ url: path });
    } else if (path?.startsWith("/pages/child/")) {
      wx.redirectTo({ url: `${PARENT_HOME}?legacy=child` });
    }
  },
});
