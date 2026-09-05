import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminRouter } from "./app/router";

describe("后台键盘可访问性", () => {
  it("可通过键盘进入侧栏并在抽屉打开后定位关闭按钮", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/institution/groups"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "工作台" })).toHaveFocus();
    await user.click(screen.getAllByRole("button", { name: "查看成员" })[0] as HTMLElement);
    expect(screen.getByRole("button", { name: "关闭抽屉" })).toHaveFocus();
  });
});
