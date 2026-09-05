Page({
  data: {
    roles: [
      { label: "小禾 · 孩子", path: "/pages/child/today/index", selected: true },
      { label: "小禾妈妈 · 家长", path: "/pages/parent/home/index", selected: false },
      { label: "语文李老师 · 教师", path: "/pages/teacher/home/index", selected: false },
    ],
  },
  choose(event: { readonly currentTarget: { readonly dataset: { readonly path?: string } } }) {
    const path = event.currentTarget.dataset.path;
    if (path !== undefined) wx.redirectTo({ url: path });
  },
});
