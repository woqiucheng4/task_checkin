import type { CollectionName } from "../domain/model.js";

export const COLLECTIONS = {
  accounts: "accounts",
  auditLogs: "audit_logs",
  childGroupMemberships: "child_group_memberships",
  childTrees: "child_trees",
  children: "children",
  commandReceipts: "command_receipts",
  consentRecords: "consent_records",
  contentProviders: "content_providers",
  exportRequests: "export_requests",
  families: "families",
  familyMembers: "family_members",
  fruitCollections: "fruit_collections",
  fruitWishLinks: "fruit_wish_links",
  groupContributions: "group_contributions",
  groupMemorials: "group_memorials",
  groupRoleBindings: "group_role_bindings",
  groupTrees: "group_trees",
  groups: "groups",
  guardianLinks: "guardian_links",
  invitations: "invitations",
  joinRequests: "join_requests",
  mediaAssets: "media_assets",
  organizationMembers: "organization_members",
  organizations: "organizations",
  plans: "plans",
  publicPoolEvents: "public_pool_events",
  reviewRecords: "review_records",
  rosterSeats: "roster_seats",
  submissions: "submissions",
  sunlightLedgers: "sunlight_ledgers",
  supportAccessGrants: "support_access_grants",
  taskAssignments: "task_assignments",
  taskDrafts: "task_drafts",
  taskTemplates: "task_templates",
  tasks: "tasks",
  tenantEntitlements: "tenant_entitlements",
  treeCatalog: "tree_catalog",
  usageCounters: "usage_counters",
  wishes: "wishes",
} as const satisfies Record<CollectionName, string>;

export interface CloudBaseIndexDefinition {
  readonly collection: CollectionName;
  readonly name: string;
  readonly fields: readonly { readonly field: string; readonly direction: "asc" | "desc" }[];
  readonly unique?: boolean;
}

export const CLOUDBASE_INDEXES: readonly CloudBaseIndexDefinition[] = [
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
    name: "actor_request_unique",
    fields: [
      { field: "accountId", direction: "asc" },
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
