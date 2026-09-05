import { buildNavigation } from "../../../presentation/page-models.js";
import { navigate, replace } from "../../../services/page-runtime.js";

Page({
  data: { child: "小禾", navigation: buildNavigation("parent", "orchard") },
  navigateTab(event: { readonly detail: { readonly path?: string } }) {
    const path = event.detail.path;
    if (path !== undefined) replace(path);
  },
  openWishes() {
    navigate("/pages/parent/wishes/index");
  },
});
