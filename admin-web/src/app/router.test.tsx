import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminRouter } from "./router";

function renderAdminAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminRouter />
    </MemoryRouter>,
  );
}

describe("管理后台角色工作区", () => {
  it.each(["institution", "platform", "provider"])("打开 %s 工作区", async (role) => {
    renderAdminAt(`/${role}`);
    expect(await screen.findByTestId(`${role}-workspace`)).toBeVisible();
  });
});
