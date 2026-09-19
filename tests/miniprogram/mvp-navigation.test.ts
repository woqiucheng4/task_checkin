import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildNavigation } from "../../miniprogram/presentation/page-models.js";

describe("MVP navigation", () => {
  it("keeps each role on the child-teacher collaboration loop", () => {
    expect(buildNavigation("parent", "home").map((item) => item.path)).toEqual([
      "/pages/parent/home/index",
      "/pages/parent/tasks/index",
      "/pages/parent/profile/index",
    ]);
    expect(buildNavigation("teacher", "home").map((item) => item.path)).toEqual([
      "/pages/teacher/home/index",
      "/pages/teacher/groups/index",
      "/pages/teacher/tasks/index",
      "/pages/teacher/profile/index",
    ]);
    expect(buildNavigation("child", "today").map((item) => item.path)).toEqual([
      "/pages/child/today/index",
      "/pages/child/orchard/index",
      "/pages/child/profile/index",
    ]);
  });

  it("does not register hidden wishes or group-tree entry points", () => {
    const app = JSON.parse(readFileSync("miniprogram/app.json", "utf8")) as { pages: string[] };

    expect(app.pages).not.toContain("pages/parent/wishes/index");
    expect(app.pages).not.toContain("pages/teacher/group-tree/index");
    expect(app.pages).toContain("pages/parent/orchard/index");
  });
});
