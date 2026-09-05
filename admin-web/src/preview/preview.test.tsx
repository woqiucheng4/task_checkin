import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminRouter } from "../app/router";

describe("移动端视觉预览", () => {
  it("选中的今日 Tab 使用可渲染的果园图标", () => {
    render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    const activeTab = screen.getByRole("button", { name: "今日" });
    const iconUse = activeTab.querySelector("use");
    expect(iconUse?.getAttribute("xlink:href") ?? iconUse?.getAttribute("href")).toBe(
      "#t-icon-apple-filled",
    );
  });

  it("孩子提交后任务进入阳光保护状态", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByRole("button", { name: "去完成" })[0] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "确认提交" }));
    expect(screen.getByText("待确认 · 阳光已保护")).toBeVisible();
  });
});
