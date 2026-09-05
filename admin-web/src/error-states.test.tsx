import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusView } from "./components/status-view/status-view";

describe("后台状态反馈", () => {
  it("离线状态说明下一步并允许重试", () => {
    const retry = vi.fn();
    render(
      <StatusView
        kind="offline"
        title="网络暂时不可用"
        message="检查网络后重试，已填写的内容不会丢失。"
        action={retry}
      />,
    );
    screen.getByRole("button", { name: "重新加载" }).click();
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toBeVisible();
  });
});
