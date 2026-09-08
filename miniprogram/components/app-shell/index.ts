Component({
  data: { headerTop: 88 },
  lifetimes: {
    attached() {
      const window = wx.getWindowInfo();
      const capsule = wx.getMenuButtonBoundingClientRect();
      this.setData({ headerTop: Math.max(capsule.bottom + 12, window.statusBarHeight + 52) });
    },
  },
  properties: {
    contextLabel: { type: String, value: "" },
    showRoleSwitch: { type: Boolean, value: true },
    subtitle: { type: String, value: "" },
    title: { type: String, value: "成长果园" },
  },
  methods: {
    openRoleSwitcher() {
      this.triggerEvent("roleswitch");
    },
    switchContext() {
      this.triggerEvent("contextswitch");
    },
  },
});
