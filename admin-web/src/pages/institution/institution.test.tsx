import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminRouter } from "../../app/router";

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminRouter />
    </MemoryRouter>,
  );
}

describe("机构管理后台", () => {
  it("筛选分组并打开成员抽屉", async () => {
    const user = userEvent.setup();
    renderAt("/institution/groups");
    await user.type(screen.getByRole("searchbox"), "三年级");
    expect(screen.getByText("三年级一班")).toBeVisible();
    const [memberButton] = screen.getAllByRole("button", { name: "查看成员" });
    expect(memberButton).toBeDefined();
    if (memberButton) await user.click(memberButton);
    expect(screen.getByRole("dialog", { name: "分组成员" })).toBeVisible();
  });

  it("机构页面只显示机构成员编号，不显示全局孩子标识", () => {
    renderAt("/institution/members");
    expect(screen.getByText("晨曦 001")).toBeVisible();
    expect(screen.queryByText(/childId/i)).not.toBeInTheDocument();
  });
});
