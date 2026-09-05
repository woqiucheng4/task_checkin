Component({
  properties: {
    items: { type: Array, value: [] },
  },
  methods: {
    navigate(event: { readonly currentTarget: { readonly dataset: unknown } }) {
      const { path } = event.currentTarget.dataset as { path?: string };
      if (path !== undefined) this.triggerEvent("navigate", { path });
    },
  },
});
