Component({
  properties: {
    item: { type: Object, value: {} },
  },
  methods: {
    activate() {
      this.triggerEvent("activate", {
        assignmentId: (this.properties.item as { assignmentId?: string }).assignmentId,
      });
    },
  },
});
