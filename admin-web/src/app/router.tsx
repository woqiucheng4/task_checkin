import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "../components/admin-shell/admin-shell";
import {
  InstitutionAnalytics,
  InstitutionBilling,
  InstitutionDashboard,
  InstitutionExports,
  InstitutionGroups,
  InstitutionMembers,
  InstitutionReviews,
  InstitutionSettings,
  InstitutionTasks,
} from "../pages/institution/institution";

function WorkspaceHome({
  workspaceRole,
}: {
  readonly workspaceRole: "institution" | "platform" | "provider";
}): React.JSX.Element {
  const title =
    workspaceRole === "institution"
      ? "机构工作台"
      : workspaceRole === "platform"
        ? "平台概览"
        : "内容概览";
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">2026年9月5日</p>
          <h1>{title}</h1>
          <p>管理页面正在载入当前工作区数据。</p>
        </div>
      </header>
    </section>
  );
}

export function AdminRouter(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/institution" replace />} />
      <Route path="/institution" element={<AdminShell workspaceRole="institution" />}>
        <Route index element={<InstitutionDashboard />} />
        <Route path="groups" element={<InstitutionGroups />} />
        <Route path="tasks" element={<InstitutionTasks />} />
        <Route path="reviews" element={<InstitutionReviews />} />
        <Route path="members" element={<InstitutionMembers />} />
        <Route path="analytics" element={<InstitutionAnalytics />} />
        <Route path="exports" element={<InstitutionExports />} />
        <Route path="billing" element={<InstitutionBilling />} />
        <Route path="settings" element={<InstitutionSettings />} />
      </Route>
      <Route path="/platform" element={<AdminShell workspaceRole="platform" />}>
        <Route index element={<WorkspaceHome workspaceRole="platform" />} />
      </Route>
      <Route path="/provider" element={<AdminShell workspaceRole="provider" />}>
        <Route index element={<WorkspaceHome workspaceRole="provider" />} />
      </Route>
      <Route path="*" element={<Navigate to="/institution" replace />} />
    </Routes>
  );
}
