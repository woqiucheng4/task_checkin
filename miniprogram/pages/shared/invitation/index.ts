import { command, selectedFamily, showError } from "../../../services/session-runtime.js";
import type { InvitationService } from "../../../../src/application/invitation-service.js";
async function preview(page: MiniPageInstance) {
  const code = String(page.data.code || "").trim();
  const childId = String(page.data.childId || "");
  if (!page.data.childValid || !childId) {
    page.setData({ ready: false, consent: false, error: "请从家长分组页选择孩子后再核验邀请码" });
    return;
  }
  if (!code) {
    wx.showToast({ icon: "none", title: "请输入邀请码" });
    return;
  }
  page.setData({ working: true, ready: false, consent: false, error: "" });
  try {
    const result = await command<Awaited<ReturnType<InvitationService["preview"]>>>(
      "PREVIEW_GROUP_INVITATION",
      { code, childId },
    );
    page.setData({
      code,
      groupName: result.groupName,
      organizationName: result.organizationName,
      expiresAt: result.expiresAt,
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
    expiresAt: "",
    nickname: "",
    childId: "",
    childValid: false,
    pendingApproval: false,
    error: "",
  },
  async onLoad(query: { code?: string; childId?: string }) {
    try {
      const family = await selectedFamily();
      const child = family.children.find((item) => item.id === query.childId);
      if (!child) {
        this.setData({
          childValid: false,
          error: "未找到可申请入组的孩子，请从家长分组页重新选择",
        });
        return;
      }
      this.setData({ childId: child.id, childValid: true, nickname: child.nickname });
      if (query.code) {
        this.setData({ code: query.code });
        await preview(this);
      }
    } catch (error) {
      showError(error);
    }
  },
  editCode(event: { detail: { value?: string } }) {
    this.setData({
      code: event.detail.value || "",
      ready: false,
      consent: false,
      pendingApproval: false,
    });
  },
  editConsent(event: { detail: { value: readonly string[] } }) {
    this.setData({ consent: event.detail.value.includes("agree") });
  },
  async preview() {
    if (!this.data.working) await preview(this);
  },
  async confirmJoin() {
    if (
      this.data.working ||
      !this.data.childValid ||
      !this.data.childId ||
      !this.data.ready ||
      !this.data.consent
    )
      return;
    this.setData({ working: true });
    try {
      await command("CLAIM_INVITATION", {
        childId: this.data.childId,
        code: this.data.code,
        disclosure: { avatar: false, displayName: true, grade: true },
      });
      this.setData({ pendingApproval: true, ready: false, consent: false });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ working: false });
    }
  },
});
