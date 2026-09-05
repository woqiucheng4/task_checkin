Page({
  data: {
    groups: [
      { contribution: 18, current: 126, name: "三年级 2 班", target: 180 },
      { contribution: 8, current: 64, name: "周六阅读小组", target: 120 },
    ],
    selected: 0,
  },
  selectGroup(event: {
    readonly currentTarget: { readonly dataset: { readonly index?: number } };
  }) {
    const index = event.currentTarget.dataset.index;
    if (index !== undefined) this.setData({ selected: index });
  },
});
