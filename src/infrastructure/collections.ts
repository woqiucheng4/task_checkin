import type { CollectionName } from "../domain/model.js";

export const COLLECTIONS = {
  aiInvocations: "task_checkin_ai_invocations",
  teacherActivationCodes: "task_checkin_teacher_activation_codes",
  accounts: "task_checkin_accounts",
  auditLogs: "task_checkin_audit_logs",
  childGroupMemberships: "task_checkin_child_group_memberships",
  childTrees: "task_checkin_child_trees",
  children: "task_checkin_children",
  commandReceipts: "task_checkin_command_receipts",
  consentRecords: "task_checkin_consent_records",
  contentProviders: "task_checkin_content_providers",
  exportRequests: "task_checkin_export_requests",
  families: "task_checkin_families",
  familyMembers: "task_checkin_family_members",
  fruitCollections: "task_checkin_fruit_collections",
  fruitWishLinks: "task_checkin_fruit_wish_links",
  groupContributions: "task_checkin_group_contributions",
  groupMemorials: "task_checkin_group_memorials",
  groupRoleBindings: "task_checkin_group_role_bindings",
  groupTrees: "task_checkin_group_trees",
  groups: "task_checkin_groups",
  growthCards: "task_checkin_growth_cards",
  guardianLinks: "task_checkin_guardian_links",
  invitations: "task_checkin_invitations",
  joinRequests: "task_checkin_join_requests",
  mediaAssets: "task_checkin_media_assets",
  organizationMembers: "task_checkin_organization_members",
  organizations: "task_checkin_organizations",
  plans: "task_checkin_plans",
  publicPoolEvents: "task_checkin_public_pool_events",
  reviewRecords: "task_checkin_review_records",
  rosterSeats: "task_checkin_roster_seats",
  submissionEvidenceLinks: "task_checkin_submission_evidence_links",
  submissions: "task_checkin_submissions",
  sunlightLedgers: "task_checkin_sunlight_ledgers",
  supportAccessGrants: "task_checkin_support_access_grants",
  taskAssignments: "task_checkin_task_assignments",
  taskDrafts: "task_checkin_task_drafts",
  taskTemplates: "task_checkin_task_templates",
  tasks: "task_checkin_tasks",
  tenantEntitlements: "task_checkin_tenant_entitlements",
  treeCatalog: "task_checkin_tree_catalog",
  usageCounters: "task_checkin_usage_counters",
  wishes: "task_checkin_wishes",
} as const satisfies Record<CollectionName, string>;

export interface CloudBaseIndexDefinition {
  readonly collection: CollectionName;
  readonly name: string;
  readonly fields: readonly { readonly field: string; readonly direction: "asc" | "desc" }[];
  readonly unique?: boolean;
}

export const CLOUDBASE_INDEXES: readonly CloudBaseIndexDefinition[] = [
  {
    collection: "aiInvocations",
    name: "ai_actor_request_status_unique",
    fields: [
      { field: "actorAccountId", direction: "asc" },
      { field: "requestId", direction: "asc" },
      { field: "status", direction: "asc" },
    ],
    unique: true,
  },
  {
    collection: "teacherActivationCodes",
    name: "teacher_activation_hash_status",
    fields: [
      { field: "codeHash", direction: "asc" },
      { field: "status", direction: "asc" },
    ],
    unique: true,
  },
  {
    collection: "teacherActivationCodes",
    name: "teacher_activation_expiry_status",
    fields: [
      { field: "expiresAt", direction: "asc" },
      { field: "status", direction: "asc" },
    ],
  },
  {
    collection: "accounts",
    name: "open_id_unique",
    fields: [{ field: "openId", direction: "asc" }],
    unique: true,
  },
  {
    collection: "guardianLinks",
    name: "guardian_child_active",
    fields: [
      { field: "accountId", direction: "asc" },
      { field: "childId", direction: "asc" },
      { field: "status", direction: "asc" },
    ],
  },
  {
    collection: "childGroupMemberships",
    name: "group_member_active",
    fields: [
      { field: "organizationId", direction: "asc" },
      { field: "groupId", direction: "asc" },
      { field: "status", direction: "asc" },
    ],
  },
  {
    collection: "taskAssignments",
    name: "assignment_business_key_unique",
    fields: [{ field: "businessKey", direction: "asc" }],
    unique: true,
  },
  {
    collection: "taskAssignments",
    name: "child_today",
    fields: [
      { field: "childId", direction: "asc" },
      { field: "occurrenceDate", direction: "asc" },
      { field: "taskState", direction: "asc" },
    ],
  },
  {
    collection: "commandReceipts",
    name: "actor_action_request_unique",
    fields: [
      { field: "accountId", direction: "asc" },
      { field: "action", direction: "asc" },
      { field: "requestId", direction: "asc" },
    ],
    unique: true,
  },
  {
    collection: "sunlightLedgers",
    name: "reward_reference_unique",
    fields: [
      { field: "referenceId", direction: "asc" },
      { field: "reason", direction: "asc" },
    ],
    unique: true,
  },
  {
    collection: "invitations",
    name: "invitation_code_unique",
    fields: [{ field: "codeHash", direction: "asc" }],
    unique: true,
  },
] as const;
