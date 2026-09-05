Component({
  properties: {
    actionLabel: { type: String, value: "重试" },
    asset: { type: String, value: "" },
    description: { type: String, value: "" },
    kind: { type: String, value: "empty" },
    title: { type: String, value: "" },
  },
  methods: {
    retry() {
      this.triggerEvent("retry");
    },
  },
});
