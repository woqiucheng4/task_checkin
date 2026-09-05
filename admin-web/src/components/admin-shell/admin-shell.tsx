import { Icon } from "tdesign-icons-react";
import { NavLink, Outlet } from "react-router-dom";
import type { AdminRole } from "../../api/types";
import appleTree from "../../assets/orchard/apple-mature.png";

interface NavItem {
  readonly icon: string;
  readonly label: string;
  readonly path: string;
}

const NAVIGATION: Readonly<Record<AdminRole, readonly NavItem[]>> = {
  institution: [
    { icon: "dashboard", label: "工作台", path: "/institution" },
    { icon: "usergroup", label: "分组", path: "/institution/groups" },
    { icon: "task", label: "任务", path: "/institution/tasks" },
    { icon: "check-circle", label: "审核", path: "/institution/reviews" },
    { icon: "user", label: "成员", path: "/institution/members" },
    { icon: "chart", label: "数据", path: "/institution/analytics" },
    { icon: "download", label: "导出", path: "/institution/exports" },
    { icon: "creditcard", label: "套餐", path: "/institution/billing" },
    { icon: "setting", label: "设置", path: "/institution/settings" },
  ],
  platform: [
    { icon: "dashboard", label: "平台概览", path: "/platform" },
    { icon: "shop", label: "租户", path: "/platform/tenants" },
    { icon: "creditcard", label: "套餐", path: "/platform/plans" },
    { icon: "app", label: "内容服务方", path: "/platform/providers" },
    { icon: "service", label: "支持工单", path: "/platform/support" },
    { icon: "lock-on", label: "临时授权", path: "/platform/access" },
    { icon: "download", label: "导出审批", path: "/platform/exports" },
    { icon: "file", label: "审计", path: "/platform/audit" },
    { icon: "setting", label: "设置", path: "/platform/settings" },
  ],
  provider: [
    { icon: "dashboard", label: "内容概览", path: "/provider" },
    { icon: "task", label: "任务模板", path: "/provider/templates" },
    { icon: "palette", label: "主题", path: "/provider/themes" },
    { icon: "image", label: "素材", path: "/provider/assets" },
    { icon: "chart", label: "使用统计", path: "/provider/usage" },
    { icon: "money-circle", label: "结算", path: "/provider/settlement" },
    { icon: "setting", label: "设置", path: "/provider/settings" },
  ],
};

const LABELS = {
  institution: { account: "陈老师", workspace: "春芽小学" },
  platform: { account: "平台运营", workspace: "成长果园平台" },
  provider: { account: "内容管理员", workspace: "知新教育内容中心" },
} as const;

export function AdminShell({
  workspaceRole,
}: {
  readonly workspaceRole: AdminRole;
}): React.JSX.Element {
  const labels = LABELS[workspaceRole];
  return (
    <div className="admin-layout" data-testid={`${workspaceRole}-workspace`}>
      <aside className="sidebar">
        <div className="brand">
          <img src={appleTree} alt="" />
          <div>
            <strong>成长果园</strong>
            <span>{labels.workspace}</span>
          </div>
        </div>
        <nav aria-label="后台主要导航">
          {NAVIGATION[workspaceRole].map((item) => (
            <NavLink key={item.path} to={item.path} end={item.path === `/${workspaceRole}`}>
              <Icon name={item.icon} size="20px" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <span>{labels.account}</span>
          <button type="button" aria-label="账户菜单">
            <Icon name="chevron-up" />
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
