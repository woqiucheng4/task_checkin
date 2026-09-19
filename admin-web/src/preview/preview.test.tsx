import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
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
    const { container } = render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    const preview = within(container);
    await user.click(preview.getAllByRole("button", { name: "去完成" })[0] as HTMLElement);
    await user.click(preview.getByRole("button", { name: "确认提交" }));
    expect(preview.getAllByText("待确认 · 阳光已保护")).toHaveLength(2);
  });

  it("首页示例中的家庭任务使用与视觉稿一致的阳光保护状态", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    const preview = within(container);
    expect(preview.getAllByText("待确认 · 阳光已保护")).toHaveLength(1);
    expect(preview.queryByText("已提交 · 等待家长确认")).not.toBeInTheDocument();
  });

  it("成长指南与浇水插画使用视觉稿原始裁片", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );
    const styles = readFileSync("src/preview/preview.css", "utf8");

    expect(styles).toContain(".growth-guide > img");
    expect(styles).toContain("min-height: 548px;");
    expect(styles).toContain("top: -52px;");
    expect(styles).toContain("width: 385px;");
    expect(styles).toContain(".journal-date {\n  position: relative;\n  z-index: 3;");
    expect(styles).toContain("background: #f6f3e3;");
    expect(within(container).getByAltText("为小树浇水").getAttribute("src")).toContain(
      "scene-watering-reference",
    );
  });

  it("默认 18/30 阳光状态使用参考稿裁出的树和成长指南", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/preview/child-today"]}>
        <AdminRouter />
      </MemoryRouter>,
    );

    expect(within(container).getByAltText("结着红苹果的苹果树").getAttribute("src")).toContain(
      "apple-reference-lv1-cutout",
    );
    expect(within(container).getByAltText("小树成长指南").getAttribute("src")).toContain(
      "growth-guide-reference",
    );
    expect(within(container).getByAltText("果园日计划").getAttribute("src")).toContain(
      "orchard-daily-title-reference",
    );
  });
});
