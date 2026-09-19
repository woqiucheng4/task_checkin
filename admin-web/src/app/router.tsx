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
import {
  PlatformAccess,
  PlatformAudit,
  PlatformDashboard,
  PlatformExports,
  PlatformPlans,
  PlatformProviders,
  PlatformSettings,
  PlatformSupport,
  PlatformTenants,
} from "../pages/platform/platform";
import {
  ProviderAssets,
  ProviderDashboard,
  ProviderSettings,
  ProviderSettlement,
  ProviderTemplates,
  ProviderThemes,
  ProviderUsage,
} from "../pages/provider/provider";
import { ParentReviewPreview } from "../preview/parent-review";
import { TeacherHomePreview } from "../preview/teacher-home";

export function AdminRouter(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/institution" replace />} />
      <Route path="/preview/child-today" element={<Navigate to="/preview/parent-review" replace />} />
      <Route path="/preview/parent-review" element={<ParentReviewPreview />} />
      <Route path="/preview/teacher-home" element={<TeacherHomePreview />} />
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
        <Route index element={<PlatformDashboard />} />
        <Route path="tenants" element={<PlatformTenants />} />
        <Route path="plans" element={<PlatformPlans />} />
        <Route path="providers" element={<PlatformProviders />} />
        <Route path="support" element={<PlatformSupport />} />
        <Route path="support/:ticketId" element={<PlatformSupport />} />
        <Route path="access" element={<PlatformAccess />} />
        <Route path="exports" element={<PlatformExports />} />
        <Route path="audit" element={<PlatformAudit />} />
        <Route path="settings" element={<PlatformSettings />} />
      </Route>
      <Route path="/provider" element={<AdminShell workspaceRole="provider" />}>
        <Route index element={<ProviderDashboard />} />
        <Route path="templates" element={<ProviderTemplates />} />
        <Route path="themes" element={<ProviderThemes />} />
        <Route path="assets" element={<ProviderAssets />} />
        <Route path="usage" element={<ProviderUsage />} />
        <Route path="settlement" element={<ProviderSettlement />} />
        <Route path="settings" element={<ProviderSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/institution" replace />} />
    </Routes>
  );
}
