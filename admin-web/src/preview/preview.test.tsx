import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AdminRouter } from "../app/router";

describe("移动端视觉预览", () => {
  afterEach(cleanup);

  it("旧孩子今日地址重定向到家长审核预览，不保留孩子提交入口", () => {
    render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "等待你的确认" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认完成" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "确认提交" })).not.toBeInTheDocument();
  });

  it("家长审核预览保留确认完成反馈", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/preview/parent-review"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "确认完成" }));
    expect(screen.getByText("朗读任务已确认")).toBeVisible();
  });
});
