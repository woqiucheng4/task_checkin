Component({
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
