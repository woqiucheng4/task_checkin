import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminRouter } from "../../app/router";

describe("内容服务方后台", () => {
  it("只展示内容聚合指标，不出现终端用户入口", () => {
    render(
      <MemoryRouter initialEntries={["/provider"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    expect(screen.getByText("模板使用次数")).toBeVisible();
    expect(screen.queryByText(/孩子|家庭|提交记录|愿望/)).not.toBeInTheDocument();
  });
});
