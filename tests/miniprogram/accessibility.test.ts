import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sharedStyles = readFileSync("miniprogram/styles/pages.wxss", "utf8");
const taskStyles = readFileSync("miniprogram/components/task-row/index.wxss", "utf8");
const statusStyles = readFileSync("miniprogram/components/status-view/index.wxss", "utf8");

describe("小程序可访问性约束", () => {
  it("主要操作触控高度不低于 88rpx", () => {
    expect(sharedStyles).toMatch(/\.primary-button[^}]*min-height:\s*88rpx/s);
    expect(sharedStyles).toMatch(/\.secondary-button[^}]*min-height:\s*88rpx/s);
    expect(taskStyles).toMatch(/\.task__button[^}]*min-height:\s*88rpx/s);
    expect(statusStyles).toMatch(/\.status__button[^}]*min-height:\s*88rpx/s);
  });

  it("减少动态效果时关闭循环动画", () => {
    expect(statusStyles).toContain("prefers-reduced-motion");
    expect(statusStyles).toMatch(/animation:\s*none/);
  });
});
