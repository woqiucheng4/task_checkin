import {
  command,
  selectedChild,
  selectedFamily,
  showError,
} from "../../../services/session-runtime.js";
import type { InvitationService } from "../../../../src/application/invitation-service.js";
async function preview(page: MiniPageInstance) {
  const code = String(page.data.code || "").trim();
  if (!code) {
    wx.showToast({ icon: "none", title: "请输入邀请码" });
    return;
  }
  page.setData({ working: true, ready: false, consent: false, error: "" });
  try {
    const result = await command<Awaited<ReturnType<InvitationService["preview"]>>>(
      "PREVIEW_GROUP_INVITATION",
      { code },
    );
    page.setData({
      code,
      groupName: result.groupName,
      organizationName: result.organizationName,
      ready: true,
    });
  } catch (error) {
    page.setData({ error: error instanceof Error ? error.message : "邀请核验失败" });
    showError(error);
  } finally {
    page.setData({ working: false });
  }
}
Page({
  data: {
    code: "",
    ready: false,
    consent: false,
    working: false,
    groupName: "",
    organizationName: "",
    nickname: "",
    error: "",
  },
  async onLoad(query: { code?: string }) {
    try {
      const childId = await selectedChild();
      const family = await selectedFamily();
      this.setData({ nickname: family.children.find((c) => c.id === childId)?.nickname || "" });
      if (query.code) {
        this.setData({ code: query.code });
        await preview(this);
      }
    } catch (error) {
      showError(error);
    }
  },
  editCode(event: { detail: { value?: string } }) {
    this.setData({ code: event.detail.value || "", ready: false, consent: false });
  },
  editConsent(event: { detail: { value: readonly string[] } }) {
    this.setData({ consent: event.detail.value.includes("agree") });
  },
  async preview() {
    if (!this.data.working) await preview(this);
  },
  async confirmJoin() {
    if (this.data.working || !this.data.ready || !this.data.consent) return;
    this.setData({ working: true });
    try {
      await command("CLAIM_INVITATION", {
        childId: await selectedChild(),
        code: this.data.code,
        disclosure: { avatar: false, displayName: true, grade: true },
      });
      wx.showToast({ icon: "success", title: "申请已提交，等待审核" });
      wx.redirectTo({ url: "/pages/parent/groups/index" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
