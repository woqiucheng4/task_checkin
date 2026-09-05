import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminRouter } from "../../app/router";

describe("平台治理后台", () => {
  it("未获得精确授权前不展示儿童内容", () => {
    render(
      <MemoryRouter initialEntries={["/platform/support/ticket-001"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    expect(screen.getByText("尚未获得儿童内容访问权限")).toBeVisible();
    expect(screen.queryByText("任务正文")).not.toBeInTheDocument();
  });
});
