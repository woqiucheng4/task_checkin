import { accountShell, command, showError } from "../../services/session-runtime.js";

const ROLE_HOME = {
  child: "/pages/child/today/index",
  parent: "/pages/parent/home/index",
  teacher: "/pages/teacher/home/index",
} as const;

Page({
  data: { loading: false, setup: false, familyName: "", nickname: "", notice: "", familyId: "" },
  editFamily(event: { detail: { value: string } }) {
    this.setData({ familyName: event.detail.value });
  },
  editChild(event: { detail: { value: string } }) {
    this.setData({ nickname: event.detail.value });
  },
  async createFamily() {
    if (this.data.loading) return;
    if (!String(this.data.nickname).trim()) return showError(new Error("请填写孩子昵称"));
    this.setData({ loading: true, notice: "" });
    try {
      let familyId = String(this.data.familyId || "");
      if (!familyId) {
        const family = await command<{ id: string }>("CREATE_FAMILY", {
          name: String(this.data.familyName).trim() || "我的家庭",
        });
        familyId = family.id;
        this.setData({ familyId });
      }
      await command("ADD_CHILD", { familyId, nickname: String(this.data.nickname).trim() });
      await accountShell(true);
      wx.redirectTo({ url: ROLE_HOME.parent });
    } catch (error) {
      this.setData({ notice: error instanceof Error ? error.message : "创建失败，请重试" });
    } finally {
      this.setData({ loading: false });
    }
  },
  async chooseRole(event: {
    readonly currentTarget: { readonly dataset: { readonly role?: string } };
  }) {
    const role = event.currentTarget.dataset.role;
    if (role === "child" || role === "parent" || role === "teacher") {
      this.setData({ loading: true, notice: "" });
      try {
        const shell = await accountShell(true);
        if (role !== "teacher" && !shell.families.some((f) => f.children.length)) {
          this.setData({ setup: true, familyId: shell.families[0]?.id || "" });
        } else wx.redirectTo({ url: ROLE_HOME[role] });
      } catch (error) {
        this.setData({ notice: error instanceof Error ? error.message : "连接失败，请重试" });
      } finally {
        this.setData({ loading: false });
      }
    }
  },
});
