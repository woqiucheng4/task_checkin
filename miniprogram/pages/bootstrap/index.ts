const ROLE_HOME = {
  child: "/pages/child/today/index",
  parent: "/pages/parent/home/index",
  teacher: "/pages/teacher/home/index",
} as const;

Page({
  chooseRole(event: { readonly currentTarget: { readonly dataset: { readonly role?: string } } }) {
    const role = event.currentTarget.dataset.role;
    if (role === "child" || role === "parent" || role === "teacher") {
      wx.redirectTo({ url: ROLE_HOME[role] });
    }
  },
});
