import { replace } from "../../../services/page-runtime.js";
import { accountShell, command, showError } from "../../../services/session-runtime.js";

function hasTeacherWorkspace(shell: Awaited<ReturnType<typeof accountShell>>): boolean {
  return shell.organizations.some((organization) => organization.type === "TEACHER_WORKSPACE");
}

Page({
  data: { code: "", workspaceName: "", working: false, error: "" },
  async onShow() {
    try {
      if (hasTeacherWorkspace(await accountShell(true))) {
        replace("/pages/teacher/groups/index");
      }
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "无法读取账号状态" });
    }
  },
  editCode(event: { detail: { value: string } }) {
    this.setData({ code: event.detail.value });
  },
  editWorkspaceName(event: { detail: { value: string } }) {
    this.setData({ workspaceName: event.detail.value });
  },
  async submitActivation() {
    if (this.data.working) return;
    const code = String(this.data.code || "").trim();
    const workspaceName = String(this.data.workspaceName || "").trim();
    if (!code || !workspaceName) {
      this.setData({ error: "请填写激活码和学习小组名称" });
      return;
    }
    this.setData({ working: true, error: "" });
    try {
      await command("ACTIVATE_TEACHER_WORKSPACE", { code, workspaceName });
      await accountShell(true);
      replace("/pages/teacher/groups/index");
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : "激活失败，请检查激活码" });
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
