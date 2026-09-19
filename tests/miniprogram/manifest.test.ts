import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REQUIRED_MOBILE_ROUTES = [
  "pages/bootstrap/index",
  "pages/shared/role-switcher/index",
  "pages/shared/invitation/index",
  "pages/teacher/activation/index",
  "pages/child/today/index",
  "pages/child/task/index",
  "pages/child/submit/index",
  "pages/child/orchard/index",
  "pages/child/profile/index",
  "pages/parent/home/index",
  "pages/parent/tasks/index",
  "pages/parent/task-editor/index",
  "pages/parent/reviews/index",
  "pages/parent/review-detail/index",
  "pages/parent/groups/index",
  "pages/parent/profile/index",
  "pages/teacher/home/index",
  "pages/teacher/groups/index",
  "pages/teacher/tasks/index",
  "pages/teacher/task-editor/index",
  "pages/teacher/reviews/index",
  "pages/teacher/review-detail/index",
  "pages/teacher/members/index",
  "pages/teacher/profile/index",
] as const;

describe("小程序页面清单", () => {
  it("注册全部已确认的移动端页面", () => {
    const app = JSON.parse(readFileSync("miniprogram/app.json", "utf8")) as {
      pages: string[];
    };
    expect(app.pages).toEqual(expect.arrayContaining([...REQUIRED_MOBILE_ROUTES]));
    expect(new Set(app.pages).size).toBe(app.pages.length);
    for (const route of app.pages) {
      for (const extension of ["json", "ts", "wxml", "wxss"]) {
        expect(existsSync(`miniprogram/${route}.${extension}`), `${route}.${extension}`).toBe(true);
      }
    }
  });
});
