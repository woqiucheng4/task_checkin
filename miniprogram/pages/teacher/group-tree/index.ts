import { buildGroupTreePage } from "../../../presentation/page-models.js";
import { coreApiClient } from "../../../services/page-runtime.js";

Page({
  data: buildGroupTreePage({
    groupName: "三年级 2 班",
    memberCount: 32,
    progress: 126,
    target: 180,
  }),
  async startTree() {
    const result = await coreApiClient.execute("START_GROUP_TREE", {
      fruitTypeId: "apple",
      groupId: "group-1",
    });
    wx.showToast({
      icon: result.ok ? "success" : "none",
      title: result.ok ? "班级果树已种下" : result.error.message,
    });
  },
});
